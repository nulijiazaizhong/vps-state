import asyncio
import json
import sqlite3
import sys
import threading
import time
from contextlib import asynccontextmanager
from datetime import datetime, timezone
import subprocess
import requests
import websockets
from websockets.client import connect as ws_connect
from websockets.exceptions import ConnectionClosedError, ConnectionClosedOK
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

# --- 确保依赖版本 ---
print("Ensuring correct websockets version is installed...")
subprocess.check_call([sys.executable, "-m", "pip", "install", "websockets==10.4"])
print("Websockets version check complete.")

# Windows asyncio 兼容处理
if sys.platform == "win32" and sys.version_info >= (3, 8):
    asyncio.set_event_loop_policy(asyncio.WindowsProactorEventLoopPolicy())

# --- 配置 ---
NEZHA_HOST = "nezha.goodnightan.com"
WS_URL = f"wss://{NEZHA_HOST}/api/v1/ws/server"
DB_FILE = "nezha_data.db"

# --- 数据库 ---
def get_db_connection():
    """获取数据库连接"""
    conn = sqlite3.connect(DB_FILE)
    conn.row_factory = sqlite3.Row
    return conn

def init_db():
    """初始化数据库和表"""
    print("Initializing new database schema...")
    with get_db_connection() as conn:
        cursor = conn.cursor()
        # --- 表1：服务器基础信息 (servers) ---
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS servers (
                id INTEGER PRIMARY KEY,
                name TEXT NOT NULL,
                display_index INTEGER DEFAULT 0,
                platform TEXT,
                cpu TEXT,
                mem_total INTEGER,
                swap_total INTEGER,
                disk_total INTEGER,
                arch TEXT,
                virtualization TEXT,
                boot_time INTEGER,
                public_note TEXT,
                country_code TEXT,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                last_active DATETIME
            )
        """)
        # --- 表2：服务器状态监控信息 (server_state) ---
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS server_state (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                server_id INTEGER NOT NULL,
                cpu_usage REAL,
                mem_used INTEGER,
                swap_used INTEGER,
                disk_used INTEGER,
                net_in_transfer INTEGER,
                net_out_transfer INTEGER,
                net_in_speed INTEGER,
                net_out_speed INTEGER,
                uptime INTEGER,
                load_1 REAL,
                load_5 REAL,
                load_15 REAL,
                tcp_conn_count INTEGER,
                udp_conn_count INTEGER,
                process_count INTEGER,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (server_id) REFERENCES servers(id) ON DELETE CASCADE
            )
        """)
        # --- 创建索引 ---
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_server_time ON server_state(server_id, created_at)")
        
        # --- 表3：TCPING 历史记录 (tcping_history) ---
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS tcping_history (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                server_id INTEGER NOT NULL,
                monitor_name TEXT,
                avg_delay REAL,
                created_at DATETIME NOT NULL,
                FOREIGN KEY (server_id) REFERENCES servers(id) ON DELETE CASCADE,
                UNIQUE(server_id, monitor_name, created_at)
            )
        """)
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_tcping_time ON tcping_history(server_id, created_at)")
        conn.commit()
    print("Database initialized with 'servers', 'server_state', and 'tcping_history' tables.")


# --- 新增：获取并存储 TCPING 历史数据 ---
async def fetch_and_store_tcping_history():
    """
    从 Nezha API 获取所有服务器的 TCPING 历史数据并存入数据库。
    改为增量更新，以避免重复获取并解决数据点限制问题。
    """
    print("Starting to fetch TCPING history for all servers (incremental update)...")
    try:
        with get_db_connection() as conn:
            server_rows = conn.execute("SELECT id FROM servers").fetchall()
            server_ids = [row['id'] for row in server_rows]

        end_ts = int(time.time() * 1000)

        for server_id in server_ids:
            try:
                # 1. 查找该服务器最新的时间戳
                with get_db_connection() as conn:
                    cursor = conn.cursor()
                    cursor.execute(
                        "SELECT MAX(created_at) FROM tcping_history WHERE server_id = ?",
                        (server_id,)
                    )
                    last_timestamp_str = cursor.fetchone()[0]

                # 2. 计算起始时间
                if last_timestamp_str:
                    # 从最后一个时间点之后的一秒开始获取，避免重复
                    last_dt = datetime.fromisoformat(last_timestamp_str.replace('Z', '+00:00'))
                    start_ts = int(last_dt.timestamp() * 1000) + 1000 # 加1秒
                else:
                    # 如果没有数据，则获取过去24小时
                    start_ts = end_ts - (24 * 3600 * 1000)

                # 3. 调用API
                api_url = f"https://{NEZHA_HOST}/api/v1/service/{server_id}?start={start_ts}&end={end_ts}"
                response = await asyncio.to_thread(requests.get, api_url, timeout=15)
                response.raise_for_status()
                
                response_data = response.json()
                monitors = response_data.get("data", [])
                if not monitors:
                    continue

                for monitor in monitors:
                    timestamps = monitor.get("created_at", [])
                    delays = monitor.get("avg_delay", [])
                    monitor_name = monitor.get("monitor_name", "N/A")

                    if not timestamps or not delays or len(timestamps) != len(delays):
                        continue

                    records_to_insert = []
                    for ts, delay in zip(timestamps, delays):
                        if delay is None: continue # 跳过空值
                        # 时间戳是毫秒，转换为ISO 8601格式的字符串 (UTC)
                        dt_object = datetime.fromtimestamp(ts / 1000, tz=timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ')
                        records_to_insert.append((server_id, monitor_name, delay, dt_object))

                    if records_to_insert:
                        with get_db_connection() as conn:
                            cursor = conn.cursor()
                            # 使用 INSERT OR IGNORE 避免因UNIQUE约束而报错
                            cursor.executemany("""
                                INSERT OR IGNORE INTO tcping_history (server_id, monitor_name, avg_delay, created_at)
                                VALUES (?, ?, ?, ?)
                            """, records_to_insert)
                            conn.commit()
                            print(f"Upserted {len(records_to_insert)} TCPING records for server {server_id} from monitor '{monitor_name}'.")

            except requests.RequestException as e:
                print(f"Failed to fetch TCPING history for server {server_id}: {e}")
            except (json.JSONDecodeError, KeyError) as e:
                print(f"Failed to parse TCPING JSON for server {server_id}: {e}")
            except Exception as e:
                print(f"An error occurred processing TCPING history for server {server_id}: {e!r}")
        
        print("Finished fetching TCPING history.")

    except Exception as e:
        print(f"An unexpected error occurred in fetch_and_store_tcping_history: {e!r}")


# --- FastAPI 应用 ---
app = FastAPI()
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"], allow_credentials=True, allow_methods=["*"], allow_headers=["*"],
)

# --- 新增：清理旧数据 ---
def cleanup_old_data(days_to_keep: int = 7):
    """清理指定天数之前的旧的监控数据"""
    print(f"Starting cleanup of data older than {days_to_keep} days...")
    try:
        with get_db_connection() as conn:
            cursor = conn.cursor()
            cutoff_date = time.strftime('%Y-%m-%d %H:%M:%S', time.gmtime(time.time() - days_to_keep * 86400))
            
            # 清理 server_state 表
            cursor.execute("DELETE FROM server_state WHERE created_at < ?", (cutoff_date,))
            print(f"Cleaned up {cursor.rowcount} old records from server_state.")

            # 清理 tcping_history 表
            cursor.execute("DELETE FROM tcping_history WHERE created_at < ?", (cutoff_date,))
            print(f"Cleaned up {cursor.rowcount} old records from tcping_history.")
            
            conn.commit()
        print("Database cleanup finished.")
    except Exception as e:
        print(f"An error occurred during database cleanup: {e!r}")


# --- WebSocket 数据处理 ---
async def fetch_nezha_ws():
    headers = {}
    try:
        async with ws_connect(WS_URL, extra_headers=headers) as ws:
            print("Connected to Nezha WebSocket.")
            message = await ws.recv()
            data = json.loads(message)

            if "servers" in data:
                sorted_servers = sorted(data["servers"], key=lambda x: x.get('display_index', 0))
                with get_db_connection() as conn:
                    cursor = conn.cursor()
                    cursor.execute("BEGIN")
                    for server in sorted_servers:
                        host = server.get('host', {})
                        state = server.get('state', {})
                        
                        # --- 1. 插入或替换服务器静态信息到 `servers` 表 ---
                        server_info = {
                            'id': server.get('id'), 'name': server.get('name'),
                            'display_index': server.get('display_index', 0),
                            'platform': host.get('platform'), 'cpu': json.dumps(host.get('cpu')),
                            'mem_total': host.get('mem_total'), 'swap_total': host.get('swap_total'),
                            'disk_total': host.get('disk_total'), 'arch': host.get('arch'),
                            'virtualization': host.get('virtualization'), 'boot_time': host.get('boot_time'),
                            'public_note': server.get('public_note'), 'country_code': server.get('country_code'),
                            'last_active': server.get('last_active')
                        }
                        s_cols = ', '.join(server_info.keys())
                        s_placeholders = ', '.join(['?'] * len(server_info))
                        cursor.execute(f"INSERT OR REPLACE INTO servers ({s_cols}) VALUES ({s_placeholders})", tuple(server_info.values()))

                        # --- 2. 插入新的服务器动态状态到 `server_state` 表 ---
                        state_info = {
                            'server_id': server.get('id'), 'cpu_usage': state.get('cpu'),
                            'mem_used': state.get('mem_used'), 'swap_used': state.get('swap_used'),
                            'disk_used': state.get('disk_used'), 'net_in_transfer': state.get('net_in_transfer'),
                            'net_out_transfer': state.get('net_out_transfer'), 'net_in_speed': state.get('net_in_speed'),
                            'net_out_speed': state.get('net_out_speed'), 'uptime': state.get('uptime'),
                            'load_1': state.get('load_1'), 'load_5': state.get('load_5'),
                            'load_15': state.get('load_15'), 'tcp_conn_count': state.get('tcp_conn_count'),
                            'udp_conn_count': state.get('udp_conn_count'), 'process_count': state.get('process_count')
                        }
                        st_cols = ', '.join(state_info.keys())
                        st_placeholders = ', '.join(['?'] * len(state_info))
                        cursor.execute(f"INSERT INTO server_state ({st_cols}) VALUES ({st_placeholders})", tuple(state_info.values()))
                    
                    conn.commit()
                    print(f"Updated {len(sorted_servers)} servers and their states in the database.")

    except (ConnectionClosedError, ConnectionClosedOK, ConnectionRefusedError) as e:
        print(f"[WebSocket] Connection closed: {e}")
    except Exception as e:
        print(f"[WebSocket] Error: {e}")

# --- 后台任务 ---
async def periodic_ws_task(interval=600):
    while True:
        await fetch_nezha_ws()
        await asyncio.sleep(interval)

async def periodic_tcping_task(interval=30):
    """定期获取TCPING数据"""
    while True:
        await fetch_and_store_tcping_history()
        await asyncio.sleep(interval)

async def periodic_cleanup_task(interval=86400):
    """定期清理旧数据，默认为一天一次"""
    while True:
        cleanup_old_data(days_to_keep=7) # 保留最近7天的数据
        await asyncio.sleep(interval)

# --- FastAPI 生命周期 ---
@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db()
    asyncio.create_task(periodic_ws_task(600)) # 10分钟一次
    asyncio.create_task(periodic_tcping_task(30)) # 30秒一次
    asyncio.create_task(periodic_cleanup_task(86400)) # 每天清理一次
    
    # 启动时立即获取和清理一次
    await fetch_nezha_ws()
    await fetch_and_store_tcping_history()
    cleanup_old_data(days_to_keep=7)
    yield

app.router.lifespan_context = lifespan

# --- API 端点 ---
@app.get("/api/servers")
async def get_servers():
    with get_db_connection() as conn:
        # 使用 LEFT JOIN 和子查询获取每个服务器的最新状态
        query = """
            SELECT s.*, st.*
            FROM servers s
            LEFT JOIN (
                SELECT *
                FROM server_state
                WHERE (server_id, created_at) IN (
                    SELECT server_id, MAX(created_at)
                    FROM server_state
                    GROUP BY server_id
                )
            ) st ON s.id = st.server_id
            ORDER BY s.display_index;
        """
        rows = conn.execute(query).fetchall()
        servers_list = [dict(row) for row in rows]
        return {"servers": servers_list}

@app.get("/api/service/{server_id}")
async def get_service_history(server_id: int):
    """
    获取指定服务器的历史状态数据，用于图表展示。
    """
    with get_db_connection() as conn:
        query = """
            SELECT * FROM server_state
            WHERE server_id = ? AND created_at >= strftime('%Y-%m-%dT%H:%M:%SZ', 'now', '-24 hours')
            ORDER BY created_at ASC;
        """
        rows = conn.execute(query, (server_id,)).fetchall()
        history_list = [dict(row) for row in rows]
        return {"data": history_list}

from fastapi import Query
from typing import Optional

@app.get("/api/tcping/{server_id}")
async def get_tcping_history(server_id: int, since: Optional[str] = Query(None)):
    """
    获取指定服务器的 TCPING 历史数据。
    支持 `since` 查询参数，用于增量获取。
    """
    with get_db_connection() as conn:
        if since:
            # 如果提供了 `since` 参数，则只获取该时间之后的数据
            query = """
                SELECT * FROM tcping_history
                WHERE server_id = ? AND created_at > ?
                ORDER BY created_at ASC;
            """
            rows = conn.execute(query, (server_id, since)).fetchall()
            history_list = [dict(row) for row in rows]
        else:
            # 否则，获取过去24小时的数据 (使用更健壮的 strftime)
            query = """
                SELECT * FROM tcping_history
                WHERE server_id = ? AND created_at >= strftime('%Y-%m-%dT%H:%M:%SZ', 'now', '-24 hours')
                ORDER BY created_at ASC;
            """
            rows = conn.execute(query, (server_id,)).fetchall()
            history_list = [dict(row) for row in rows]
        
        return {"data": history_list}

# --- 启动入口 ---
if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
