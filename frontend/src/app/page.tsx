"use client";

import { useEffect, useState, useRef } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';

// --- 从后端API获取的服务器数据类型 (JOINed) ---
// 该接口反映了后端 `servers` 表和 `server_state` 表 JOIN 后的数据结构
interface Server {
  // --- 来自 `servers` 表 ---
  id: number;
  name: string;
  cpu: string; // 新增：CPU型号信息 (JSON 字符串)
  country_code: string;
  platform: string;
  mem_total: number;
  disk_total: number;
  last_active: string;
  public_note: string;

  // --- 来自 `server_state` 表 ---
  cpu_usage: number;
  mem_used: number;
  disk_used: number;
  net_in_transfer: number;
  net_out_transfer: number;
  net_in_speed: number;
  net_out_speed: number;
  uptime: number;
  load_1: number;
}

// --- 前端展示用的数据类型定义 ---
interface TranslatedServer {
  id: number;
  名称: string;
  国家: string;
  平台: string;
  CPU: string;
  总内存: string;
  已用内存: string;
  总硬盘: string;
  已用硬盘: string;
  总下载量: string;
  总上传量: string;
  下行速度: string;
  上行速度: string;
  在线时间: string;
  负载: number;
  最后活跃: string;
  带宽?: string;
  月流量?: string;
  网络线路?: string;
  提供商?: string;
  到期时间?: string;
}

// --- 从 /api/service/{id} 获取的历史状态数据点 ---
interface ServiceDataPoint {
  id: number;
  server_id: number;
  cpu_usage: number;
  mem_used: number;
  // ... 可以添加更多需要的字段
  created_at: string;
}

// --- 新增：从 /api/tcping/{id} 获取的 TCPing 数据点 ---
interface TcpingDataPoint {
  server_id: number;
  monitor_name: string;
  avg_delay: number;
  created_at: string;
}

// --- 新增：为 Recharts 转换后的数据格式 ---
interface TransformedTcpingData {
  created_at: string;
  [key: string]: any; // 允许动态添加监控点名称作为键
}


// --- 工具函数 ---
const formatBytes = (bytes: number, decimals = 2) => {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB', 'PB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
};

const formatUptime = (seconds: number) => {
  const days = Math.floor(seconds / (24 * 3600));
  seconds %= (24 * 3600);
  const hours = Math.floor(seconds / 3600);
  seconds %= 3600;
  const minutes = Math.floor(seconds / 60);
  return `${days}天 ${hours}小时 ${minutes}分钟`;
};

// --- 新增：动态颜色生成函数 (黄金角度算法，确保颜色区分度) ---
const getDistinctColor = (index: number) => {
  const hue = (index * 137.508) % 360; // 使用黄金角度确保色相分布均匀
  const saturation = 75;
  const lightness = 55;
  return `hsl(${hue}, ${saturation}%, ${lightness}%)`;
};


// --- 数据格式化函数 ---
const formatServerData = (server: Server): TranslatedServer => {
  let publicNote = {};
  try {
    // public_note 字段现在是可选的，需要检查
    const rawPublicNote = server.public_note || '{}';
    if (rawPublicNote) {
      publicNote = JSON.parse(rawPublicNote);
    }
  } catch (e) {
    console.error(`Failed to parse public_note for server ${server.id}:`, e);
  }

  const planData = (publicNote as any).planDataMod || {};
  const billingData = (publicNote as any).billingDataMod || {};

  // --- 全面、安全地格式化所有数据 ---
  const safeGet = (value: any, defaultValue: number = 0) => value ?? defaultValue;

  const lastActiveDisplay = server.last_active 
    ? new Date(server.last_active).toLocaleString('zh-CN')
    : 'N/A';

  return {
    // --- 直接映射自 `Server` 对象 ---
    id: server.id,
    名称: server.name,
    国家: server.country_code,
    平台: server.platform,
    负载: safeGet(server.load_1),
    最后活跃: lastActiveDisplay,

    // --- 格式化和计算 ---
    CPU: (() => {
      try {
        const cpuCores = JSON.parse(server.cpu || '[]');
        return Array.isArray(cpuCores) && cpuCores.length > 0 ? cpuCores[0] : 'N/A';
      } catch {
        return 'N/A';
      }
    })(),
    总内存: formatBytes(safeGet(server.mem_total)),
    已用内存: formatBytes(safeGet(server.mem_used)),
    总硬盘: formatBytes(safeGet(server.disk_total)),
    已用硬盘: formatBytes(safeGet(server.disk_used)),
    总下载量: formatBytes(safeGet(server.net_in_transfer)),
    总上传量: formatBytes(safeGet(server.net_out_transfer)),
    下行速度: `${formatBytes(safeGet(server.net_in_speed))}/s`,
    上行速度: `${formatBytes(safeGet(server.net_out_speed))}/s`,
    在线时间: formatUptime(safeGet(server.uptime)),

    // --- 从 public_note 解析 ---
    带宽: planData.bandwidth,
    月流量: planData.trafficVol,
    网络线路: planData.networkRoute,
    提供商: planData.extra,
    到期时间: billingData.endDate ? new Date(billingData.endDate).toLocaleDateString('zh-CN') : undefined,
  };
};

// --- 辅助函数：将数组按指定大小分块 ---
const chunk = <T,>(arr: T[], size: number): T[][] =>
  Array.from({ length: Math.ceil(arr.length / size) }, (v, i) =>
    arr.slice(i * size, i * size + size)
  );

// --- 主页面组件 ---
export default function Home() {
  const [servers, setServers] = useState<TranslatedServer[]>([]);
  const [serviceData, setServiceData] = useState<ServiceDataPoint[]>([]);
  const [tcpingData, setTcpingData] = useState<TransformedTcpingData[]>([]);
  const [monitorNames, setMonitorNames] = useState<string[]>([]);
  const [selectedServer, setSelectedServer] = useState<TranslatedServer | null>(null);
  const selectedServerIdRef = useRef<number | null>(null); // 使用 Ref 来避免闭包陷阱

  // --- 新增 Refs 来解决 setInterval 的闭包陷阱 ---
  const tcpingDataRef = useRef(tcpingData);
  tcpingDataRef.current = tcpingData;
  const monitorNamesRef = useRef(monitorNames);
  monitorNamesRef.current = monitorNames;

  // 获取服务器列表
  useEffect(() => {
    // --- 页面加载时，首先尝试从 localStorage 加载缓存数据 ---
    const cachedData = localStorage.getItem('cachedNezhaServers');
    if (cachedData) {
      try {
        const serversFromCache: Server[] = JSON.parse(cachedData);
        const formattedServers = serversFromCache.map(formatServerData);
        setServers(formattedServers);
        if (!selectedServer && formattedServers.length > 0) {
          setSelectedServer(formattedServers[0]);
        }
      } catch (e) {
        console.error("Failed to parse cached server data:", e);
      }
    }

    const fetchServers = async () => {
      try {
        const response = await fetch("http://localhost:8000/api/servers");
        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }
        const data = await response.json();
        const serversFromApi: Server[] = data.servers || [];
        
        // --- 请求成功，更新状态并缓存数据 ---
        const formattedServers = serversFromApi.map(formatServerData);
        setServers(formattedServers);
        localStorage.setItem('cachedNezhaServers', JSON.stringify(serversFromApi)); // 缓存原始API数据

        // 使用 Ref 来更新选择的服务器，避免闭包问题
        if (selectedServerIdRef.current) {
          const updatedSelectedServer = formattedServers.find(s => s.id === selectedServerIdRef.current);
          setSelectedServer(updatedSelectedServer || (formattedServers.length > 0 ? formattedServers[0] : null));
        } else if (formattedServers.length > 0) {
          const initialServer = formattedServers[0];
          setSelectedServer(initialServer);
          selectedServerIdRef.current = initialServer.id;
        } else {
          setSelectedServer(null);
        }
      } catch (error) {
        console.error("获取服务器失败，将使用缓存数据（如果可用）:", error);
        // 当请求失败时，我们不做任何操作，因为缓存数据已在初始加载时设置
      }
    };

    fetchServers(); // 立即获取一次
    const interval = setInterval(fetchServers, 5000); // 每5秒刷新一次
    return () => clearInterval(interval);
  }, []); // 依赖项为空，确保只在挂载时设置初始缓存和定时器

  // 获取所选服务器的服务数据
  useEffect(() => {
    if (!selectedServer) return;

    const fetchServiceData = async () => {
      try {
        const response = await fetch(`http://localhost:8000/api/service/${selectedServer.id}`);
        const data = await response.json();
        setServiceData(data.data || []);
      } catch (error) {
        console.error(`获取服务器 ${selectedServer.id} 的服务数据失败:`, error);
      }
    };

    fetchServiceData();
    const interval = setInterval(fetchServiceData, 120000); // 每2分钟刷新一次
    return () => clearInterval(interval);
  }, [selectedServer]);

  const lastTimestampRef = useRef<string | null>(null); // Ref to store the last timestamp

  // --- 增强版：获取并处理 TCPing 数据 (增量更新 + 填补数据断层) ---
  useEffect(() => {
    if (!selectedServer) return;

    // --- 当服务器切换时，重置状态 ---
    setTcpingData([]);
    setMonitorNames([]);
    lastTimestampRef.current = null;

    const fetchAndProcessTcpingData = async (isInitial: boolean) => {
      try {
        let url = `http://localhost:8000/api/tcping/${selectedServer.id}`;
        if (!isInitial && lastTimestampRef.current) {
          url += `?since=${encodeURIComponent(lastTimestampRef.current)}`;
        }

        const response = await fetch(url);
        const data = await response.json();
        const rawData: TcpingDataPoint[] = data.data || [];

        if (rawData.length === 0 && !isInitial) return;

        // --- 1. 数据转换 ---
        const transformed: { [key: string]: TransformedTcpingData } = {};
        const newMonitors = new Set<string>();
        rawData.forEach(point => {
          const time = point.created_at;
          if (!transformed[time]) transformed[time] = { created_at: time };
          transformed[time][point.monitor_name] = point.avg_delay;
          newMonitors.add(point.monitor_name);
        });
        const newChartData = Object.values(transformed);

        // --- 2. 获取当前状态和所有监控点名称 ---
        const prevData = tcpingDataRef.current;
        const prevNames = monitorNamesRef.current;
        const allMonitorNames = Array.from(new Set([...prevNames, ...newMonitors])).filter(name => name != null);

        // --- 3. 合并并排序数据 ---
        const dataMap = new Map<string, TransformedTcpingData>();
        prevData.forEach(item => dataMap.set(item.created_at, item));
        newChartData.forEach(item => dataMap.set(item.created_at, item));
        const combinedData = Array.from(dataMap.values()).sort((a, b) => 
          new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
        );

        // --- 4. 最终解决方案：双向填充，彻底解决数据断层 ---

        // 第一步：为每个监控项找到其第一个有效值作为基准
        const firstAvailableValues: { [key: string]: number } = {};
        for (const name of allMonitorNames) {
          const firstPointWithValue = combinedData.find(p => p[name] !== undefined);
          if (firstPointWithValue) {
            firstAvailableValues[name] = firstPointWithValue[name] as number;
          }
        }

        // 第二步：使用“最后已知值”策略进行遍历填充
        // 初始化“最后已知值”为第一步找到的基准值
        const lastKnownValues = { ...firstAvailableValues };
        for (const dataPoint of combinedData) {
          for (const name of allMonitorNames) {
            if (dataPoint[name] !== undefined) {
              // 如果当前点有值，更新“最后已知值”
              lastKnownValues[name] = dataPoint[name];
            } else {
              // 如果当前点没有值，用“最后已知值”进行填充
              dataPoint[name] = lastKnownValues[name];
            }
          }
        }

        // --- 5. 应用数据窗口 ---
        const MAX_DATA_POINTS = 300;
        const finalData = combinedData.slice(-MAX_DATA_POINTS);

        // --- 6. 更新状态 ---
        setTcpingData(finalData);
        setMonitorNames(allMonitorNames);

        // --- 7. 更新最新时间戳 ---
        const latestTimestamp = rawData[rawData.length - 1]?.created_at;
        if (latestTimestamp) {
          lastTimestampRef.current = latestTimestamp;
        }

      } catch (error) {
        console.error(`获取服务器 ${selectedServer.id} 的 TCPing 数据失败:`, error);
      }
    };

    fetchAndProcessTcpingData(true);
    const interval = setInterval(() => fetchAndProcessTcpingData(false), 5000);
    return () => clearInterval(interval);
  }, [selectedServer?.id]);


  const handleServerSelect = (server: TranslatedServer) => {
    setSelectedServer(server);
    selectedServerIdRef.current = server.id; // 当用户点击时，更新 Ref
  };

  return (
    <div className="min-h-screen p-8">
      <header className="mb-8">
        <h1 className="text-4xl font-bold text-center">服务器监控面板</h1>
      </header>

      <main>
        <section className="mb-12">
          <h2 className="text-2xl font-semibold mb-4">服务器状态</h2>
          <div className="space-y-6">
            {chunk([...servers].reverse().filter(s => s && s.id != null), 4).map((serverRow, rowIndex) => (
              <div key={rowIndex}>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                  {serverRow.map((server) => (
                    <Card
                      key={server.id}
                      className={`cursor-pointer transition-all ${selectedServer?.id === server.id ? 'ring-2 ring-blue-500' : ''}`}
                      onClick={() => handleServerSelect(server)}
                    >
                      <CardHeader>
                        <CardTitle className="flex items-center justify-between">
                          <span className="text-lg font-bold">{server.名称}</span>
                          <span className={`fi fi-${server.国家.toLowerCase()}`}></span>
                        </CardTitle>
                      </CardHeader>
                      <CardContent className="text-sm space-y-2">
                        <p>CPU: {server.CPU}</p>
                        <p>内存: {server.已用内存} / {server.总内存}</p>
                        <p>硬盘: {server.已用硬盘} / {server.总硬盘}</p>
                        <p>上传: {server.上行速度}</p>
                        <p>下载: {server.下行速度}</p>
                        <p>在线时间: {server.在线时间}</p>
                        {server.带宽 && <p>带宽: {server.带宽}</p>}
                        {server.月流量 && <p>流量: {server.月流量}</p>}
                        {server.到期时间 && <p>到期时间: {server.到期时间}</p>}
                      </CardContent>
                    </Card>
                  ))}
                </div>

                {/* --- 动态插入详情区域 --- */}
                {selectedServer && serverRow.some(s => s.id === selectedServer.id) && (
                  <section className="mt-6">
                    <h2 className="text-2xl font-semibold mb-4">
                      {selectedServer.名称} - 详细信息与实时监控
                    </h2>
                    <Tabs defaultValue="details" className="mt-6">
                      <TabsList className="grid w-full grid-cols-2">
                        <TabsTrigger value="details">详细信息</TabsTrigger>
                        <TabsTrigger value="tcping">TCPing 延迟 (ms)</TabsTrigger>
                      </TabsList>
                      <TabsContent value="details">
                        <Card>
                          <CardHeader><CardTitle>详细信息</CardTitle></CardHeader>
                          <CardContent className="text-sm space-y-3 pt-6">
                            <p><strong>系统:</strong> {selectedServer.平台}</p>
                            <p><strong>提供商:</strong> {selectedServer.提供商 || 'N/A'}</p>
                            <p><strong>网络线路:</strong> {selectedServer.网络线路 || 'N/A'}</p>
                            <p><strong>总上传量:</strong> {selectedServer.总上传量}</p>
                            <p><strong>总下载量:</strong> {selectedServer.总下载量}</p>
                            <p><strong>负载 (1m):</strong> {selectedServer.负载}</p>
                            <p><strong>最后活跃:</strong> {selectedServer.最后活跃}</p>
                          </CardContent>
                        </Card>
                      </TabsContent>
                      <TabsContent value="tcping">
                        <Card>
                          <CardHeader><CardTitle>TCPing 延迟 (ms)</CardTitle></CardHeader>
                          <CardContent className="pt-6">
                            <div className="mb-4 flex flex-wrap gap-x-4 gap-y-2 text-sm text-muted-foreground">
                      {tcpingData.length > 0 && [...monitorNames].reverse().map((name) => {
                        const latestDataPoint = tcpingData[tcpingData.length - 1];
                        const value = latestDataPoint[name];
                        const originalIndex = monitorNames.indexOf(name);
                        return (
                          <div key={name} className="flex items-center gap-2">
                            <span className="h-2 w-2 rounded-full" style={{ backgroundColor: getDistinctColor(originalIndex) }} />
                            <span>{name}: <strong>{value != null ? `${value.toFixed(2)} ms` : 'N/A'}</strong></span>
                          </div>
                        );
                      })}
                            </div>
                            <ResponsiveContainer key={selectedServer.id} width="100%" height={300}>
                              <AreaChart data={tcpingData}>
                                <defs>
                                  {monitorNames.map((name, index) => {
                                    const color = getDistinctColor(index);
                                    return (
                                      <linearGradient key={`color-${name}`} id={`color-${name}`} x1="0" y1="0" x2="0" y2="1">
                                        <stop offset="5%" stopColor={color} stopOpacity={0.8}/>
                                        <stop offset="95%" stopColor={color} stopOpacity={0}/>
                                      </linearGradient>
                                    );
                                  })}
                                </defs>
                                <CartesianGrid strokeDasharray="3 3" stroke="rgba(0, 0, 0, 0.1)" />
                                <XAxis 
                                  dataKey="created_at" 
                                  stroke="rgba(0, 0, 0, 0.5)"
                                  tickFormatter={(timeStr) => new Date(timeStr).toLocaleTimeString()}
                                />
                                <YAxis stroke="rgba(0, 0, 0, 0.5)" unit="ms"/>
                        <Tooltip
                          wrapperStyle={{ zIndex: 9999 }}
                          contentStyle={{
                            backgroundColor: 'rgba(255, 255, 255, 0.75)',
                            border: '1px solid rgba(0, 0, 0, 0.1)',
                            backdropFilter: 'blur(4px)',
                            WebkitBackdropFilter: 'blur(4px)',
                            borderRadius: '0.5rem',
                            boxShadow: '0 4px 6px rgba(0, 0, 0, 0.1)',
                          }}
                          labelStyle={{ color: '#1f2937', fontWeight: 'bold' }}
                          labelFormatter={(label) => new Date(label).toLocaleString('zh-CN')}
                        />
                                <Legend verticalAlign="bottom" height={36}/>
                        {[...monitorNames].reverse().filter(name => name != null).map((name) => {
                          const originalIndex = monitorNames.indexOf(name);
                          const color = getDistinctColor(originalIndex);
                          return (
                            <Area 
                              key={name}
                              type="monotone" 
                              dataKey={name}
                              stroke={color}
                              fill={`url(#color-${name})`}
                              fillOpacity={1}
                              name={name}
                              unit="ms"
                              connectNulls={true}
                              strokeWidth={2}
                            />
                          );
                        })}
                              </AreaChart>
                            </ResponsiveContainer>
                          </CardContent>
                        </Card>
                      </TabsContent>
                    </Tabs>
                  </section>
                )}
              </div>
            ))}
          </div>
        </section>
      </main>
    </div>
  );
}
