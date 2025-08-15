import sqlite3
import json
import sys

DB_FILE = "nezha_data.db"

def read_database_content():
    """
    连接到 SQLite 数据库并打印所有表的内容。
    """
    conn = None
    try:
        conn = sqlite3.connect(DB_FILE)
        conn.row_factory = sqlite3.Row
        cursor = conn.cursor()

        print("--- Reading 'servers' table (Static Info) ---")
        cursor.execute("SELECT * FROM servers ORDER BY display_index")
        servers = cursor.fetchall()
        if not servers:
            print("  No data found in 'servers' table.")
        else:
            for server in servers:
                print(f"\n  [Server ID: {server['id']}] Name: {server['name']}")
                for key, value in dict(server).items():
                    print(f"    - {key}: {value}")

        print("\n--- Reading 'server_state' table (Last 5 states) ---")
        cursor.execute("SELECT * FROM server_state ORDER BY created_at DESC LIMIT 5")
        states = cursor.fetchall()
        if not states:
            print("  No data found in 'server_state' table.")
        else:
            for state in states:
                print(f"\n  [State ID: {state['id']}] Server ID: {state['server_id']} at {state['created_at']}")
                for key, value in dict(state).items():
                     print(f"    - {key}: {value}")

    except sqlite3.Error as e:
        print(f"Database error: {e}", file=sys.stderr)
    except FileNotFoundError:
        print(f"Error: Database file '{DB_FILE}' not found.", file=sys.stderr)
    finally:
        if conn:
            conn.close()

if __name__ == "__main__":
    read_database_content()
