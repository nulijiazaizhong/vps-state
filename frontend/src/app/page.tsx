"use client";

import { useEffect, useState, useRef } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { DateRangePicker } from "@/components/ui/date-range-picker";
import { ThemeSwitcher } from "@/components/ui/theme-switcher";
import {
  ChartConfig,
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart";
import { today, getLocalTimeZone } from "@internationalized/date";
import { useDateFormatter, useLocale } from "react-aria";
import { useTheme } from "next-themes";

// --- 从后端API获取的服务器数据类型 (JOINed) ---
interface Server {
  id: number;
  name: string;
  cpu: string;
  country_code: string;
  platform: string;
  mem_total: number;
  disk_total: number;
  last_active: string;
  public_note: string;
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

// --- TCPing 数据点 ---
interface TcpingDataPoint {
  server_id: number;
  monitor_name: string;
  avg_delay: number;
  created_at: string;
}

// --- Recharts 转换后的数据格式 ---
interface TransformedTcpingData {
  created_at: number;
  [key: string]: any;
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

const getDistinctColor = (index: number) => {
  const hue = (index * 137.508) % 360;
  const saturation = 75;
  const lightness = 55;
  return `hsl(${hue}, ${saturation}%, ${lightness}%)`;
};

// --- 数据格式化函数 ---
const formatServerData = (server: Server): TranslatedServer => {
  let publicNote = {};
  try {
    const rawPublicNote = server.public_note || '{}';
    if (rawPublicNote) publicNote = JSON.parse(rawPublicNote);
  } catch (e) {
    console.error(`Failed to parse public_note for server ${server.id}:`, e);
  }

  const planData = (publicNote as any).planDataMod || {};
  const billingData = (publicNote as any).billingDataMod || {};
  const safeGet = (value: any, defaultValue: number = 0) => value ?? defaultValue;

  return {
    id: server.id,
    名称: server.name,
    国家: server.country_code,
    平台: server.platform,
    负载: safeGet(server.load_1),
    最后活跃: server.last_active ? new Date(server.last_active).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' }) : 'N/A',
    CPU: (() => {
      try {
        const cpuCores = JSON.parse(server.cpu || '[]');
        return Array.isArray(cpuCores) && cpuCores.length > 0 ? cpuCores[0] : 'N/A';
      } catch { return 'N/A'; }
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
    带宽: planData.bandwidth,
    月流量: planData.trafficVol,
    网络线路: planData.networkRoute,
    提供商: planData.extra,
    到期时间: billingData.endDate ? new Date(billingData.endDate).toLocaleDateString('zh-CN') : undefined,
  };
};

const chunk = <T,>(arr: T[], size: number): T[][] =>
  Array.from({ length: Math.ceil(arr.length / size) }, (v, i) =>
    arr.slice(i * size, i * size + size)
  );

const MONITOR_CATEGORIES = ["移动", "联通", "电信", "国际"];
const getMonitorCategory = (name: string): string => {
  if (name.includes("移动")) return "移动";
  if (name.includes("联通")) return "联通";
  if (name.includes("电信")) return "电信";
  if (["GitHub", "YouTube", "Google", "Microsoft", "微软", "谷歌"].some(keyword => name.includes(keyword))) return "国际";
  return "国际";
};

// --- 主页面组件 ---

const timeRanges = [
  { label: "1H", value: { hours: 1 } },
  { label: "6H", value: { hours: 6 } },
  { label: "24H", value: { days: 1 } },
  { label: "7D", value: { days: 7 } },
];

export default function Home() {
  const [servers, setServers] = useState<TranslatedServer[]>([]);
  const [tcpingData, setTcpingData] = useState<TransformedTcpingData[]>([]);
  const [monitorNames, setMonitorNames] = useState<string[]>([]);
  const [selectedServer, setSelectedServer] = useState<TranslatedServer | null>(null);
  const [isLoadingTcping, setIsLoadingTcping] = useState(true);
  const [date, setDate] = useState({
    start: today(getLocalTimeZone()).subtract({ days: 1 }),
    end: today(getLocalTimeZone()),
  });
  const [activeRangeLabel, setActiveRangeLabel] = useState("24H");
  const { setTheme, theme } = useTheme();
  const [activeMonitors, setActiveMonitors] = useState<string[] | null>(null);
  const [activeCategories, setActiveCategories] = useState<string[]>(["移动", "联通", "电信"]);
  const [allLocations, setAllLocations] = useState<string[]>([]);
  const [activeLocations, setActiveLocations] = useState<string[]>(["上海", "北京", "广东", "广州"]);
  const [refreshKey, setRefreshKey] = useState(0);
  const [insufficientDataMessage, setInsufficientDataMessage] = useState<string>("");
  const selectedServerIdRef = useRef<number | null>(null);
  const monitorNamesRef = useRef(monitorNames);
  monitorNamesRef.current = monitorNames;
  let formatter = useDateFormatter({ dateStyle: "long" });

  useEffect(() => {
    const fetchServers = async () => {
      try {
        const response = await fetch("http://localhost:8000/api/servers");
        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
        const data = await response.json();
        const serversFromApi: Server[] = data.servers || [];
        const formattedServers = serversFromApi.map(formatServerData);
        setServers(formattedServers);
        if (!selectedServerIdRef.current && formattedServers.length > 0) {
          const initialServer = formattedServers[0];
          setSelectedServer(initialServer);
          selectedServerIdRef.current = initialServer.id;
        }
      } catch (error) {
        console.error("获取服务器列表失败:", error);
      }
    };
    fetchServers();
    const interval = setInterval(fetchServers, 5000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (!selectedServer) return;
    setIsLoadingTcping(true);
    setMonitorNames([]);

    const fetchAndProcessTcpingData = async () => {
      setInsufficientDataMessage("");
      try {
        let url = `http://localhost:8000/api/tcping/${selectedServer.id}`;
        const params = new URLSearchParams();
        // Always fetch a generous 7-day window to ensure we have enough data for client-side filtering.
        const now = new Date();
        const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        params.append("since", sevenDaysAgo.toISOString());
        params.append("until", now.toISOString());
        params.append("resample", "5m");
        const queryString = params.toString();
        if (queryString) url += `?${queryString}`;

        const response = await fetch(url);
        const data = await response.json();
        const rawData: TcpingDataPoint[] = data.data || [];

        const transformed: { [key: string]: any } = {};
        const newMonitors = new Set<string>();
        rawData.forEach(point => {
          const time = point.created_at;
          if (!transformed[time]) transformed[time] = { created_at: new Date(time).getTime() };
          transformed[time][point.monitor_name] = point.avg_delay;
          newMonitors.add(point.monitor_name);
        });
        const newChartData: TransformedTcpingData[] = Object.values(transformed);
        const allMonitorNames = Array.from(newMonitors).filter(name => name != null);
        setMonitorNames(allMonitorNames);

        const locations = new Set<string>();
        const knownPrefixes = ["上海", "北京", "广东", "广州", "江苏"];
        allMonitorNames.forEach(name => {
          for (const prefix of knownPrefixes) {
            if (name.startsWith(prefix)) {
              locations.add(prefix);
              break;
            }
          }
        });
        setAllLocations(Array.from(locations).sort());

        setTcpingData(() => {
          const dataMap = new Map<number, TransformedTcpingData>();
          newChartData.forEach(item => dataMap.set(item.created_at, item));
          const freshData = Array.from(dataMap.values()).sort((a, b) => a.created_at - b.created_at);
          const lastKnownValues: { [key: string]: number } = {};
          allMonitorNames.forEach(name => {
            const firstPoint = freshData.find(p => p[name] !== undefined);
            if (firstPoint) lastKnownValues[name] = firstPoint[name] as number;
          });
          freshData.forEach(dataPoint => {
            allMonitorNames.forEach(name => {
              if (dataPoint[name] !== undefined) lastKnownValues[name] = dataPoint[name];
              else dataPoint[name] = lastKnownValues[name];
            });
          });
          return freshData;
        });
      } catch (error) {
        console.error(`获取 TCPing 数据失败:`, error);
        if (activeRangeLabel) {
          setInsufficientDataMessage(`获取数据失败，无法显示${activeRangeLabel}的图表`);
        } else {
          setInsufficientDataMessage("获取数据失败，无法显示图表");
        }
      } finally {
        setIsLoadingTcping(false);
      }
    };
    fetchAndProcessTcpingData();
  }, [selectedServer?.id, refreshKey]);

  const handleTimeRangeClick = (range: any, label: string) => {
    if (label === activeRangeLabel) {
      setRefreshKey(prev => prev + 1);
    } else {
      setDate({
        start: today(getLocalTimeZone()).subtract(range),
        end: today(getLocalTimeZone()),
      });
      setActiveRangeLabel(label);
    }
  };

  const handleServerSelect = (server: TranslatedServer) => {
    setSelectedServer(server);
    selectedServerIdRef.current = server.id;
  };

  const handleMonitorClick = (monitorName: string) => {
    setActiveMonitors(prev => {
      if (!prev) return [monitorName];
      const newActive = new Set(prev);
      if (newActive.has(monitorName)) newActive.delete(monitorName);
      else newActive.add(monitorName);
      const newActiveArray = Array.from(newActive);
      return newActiveArray.length === 0 ? null : newActiveArray;
    });
  };

  const handleCategoryClick = (category: string) => {
    setActiveCategories(prev => {
      const newCategories = new Set(prev);
      if (newCategories.has(category)) newCategories.delete(category);
      else newCategories.add(category);
      setActiveMonitors(null);
      return Array.from(newCategories);
    });
  };

  const handleLocationClick = (location: string) => {
    setActiveLocations(prev => {
      const newLocations = new Set(prev);
      if (newLocations.has(location)) {
        newLocations.delete(location);
      } else {
        newLocations.add(location);
      }
      setActiveMonitors(null);
      return Array.from(newLocations);
    });
  };

  const categoryFilteredMonitors = monitorNames.filter(name =>
    activeCategories.includes(getMonitorCategory(name)) &&
    activeLocations.some(location => name.includes(location))
  ).sort();
  const displayedMonitors = activeMonitors ?? categoryFilteredMonitors;

  // This is the definitive, correct filtering logic.
  const getFilteredData = () => {
    const now = new Date().getTime();

    // Case 1: A quick time range button is active (e.g., "1H", "7D").
    if (activeRangeLabel) {
      const range = timeRanges.find(r => r.label === activeRangeLabel);
      if (!range) return []; // Should not happen

      const durationInMs = (range.value.hours || 0) * 3600 * 1000 + (range.value.days || 0) * 86400 * 1000;
      const startTime = now - durationInMs;
      
      return tcpingData.filter(d => d.created_at >= startTime && d.created_at <= now);
    }
    
    // Case 2: A custom date range is selected from the picker.
    else {
      const startTime = date.start.toDate(getLocalTimeZone()).getTime();
      const endOfDay = date.end.toDate(getLocalTimeZone());
      endOfDay.setHours(23, 59, 59, 999); // Include the entire end day
      const endTime = endOfDay.getTime();
      
      return tcpingData.filter(d => d.created_at >= startTime && d.created_at <= endTime);
    }
  };

  const filteredTcpingData = getFilteredData();
  const isDataInsufficient = !isLoadingTcping && filteredTcpingData.length < 2;

  return (
    <div className="min-h-screen p-8">
      <header className="mb-8 flex items-center justify-between">
        <h1 className="text-4xl font-bold text-center">服务器监控面板</h1>
        <ThemeSwitcher
          value={theme}
          onChange={(value: "light" | "dark" | "system") => {
            setTheme(value);
          }}
        />
      </header>
      <main>
        <section className="mb-12">
          <h2 className="text-2xl font-semibold mb-4">服务器状态</h2>
          <div className="space-y-6">
            {chunk([...servers].reverse().filter(s => s && s.id != null), 4).map((serverRow, rowIndex) => (
              <div key={rowIndex}>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                  {serverRow.map((server) => (
                    <Card key={server.id} className={`cursor-pointer transition-all ${selectedServer?.id === server.id ? 'ring-2 ring-blue-500' : ''}`} onClick={() => handleServerSelect(server)}>
                      <CardHeader><CardTitle className="flex items-center justify-between"><span className="text-lg font-bold">{server.名称}</span><span className={`fi fi-${server.国家.toLowerCase()}`}></span></CardTitle></CardHeader>
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
                {selectedServer && serverRow.some(s => s.id === selectedServer.id) && (
                  <section className="mt-6">
                    <h2 className="text-2xl font-semibold mb-4">{selectedServer.名称} - 详细信息与实时监控</h2>
                    <Tabs defaultValue="details" className="mt-6">
                      <TabsList className="grid w-full grid-cols-2"><TabsTrigger value="details">详细信息</TabsTrigger><TabsTrigger value="tcping">TCPing 延迟 (ms)</TabsTrigger></TabsList>
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
                          <CardHeader><div className="flex justify-between items-center"><CardTitle>TCPing 延迟 (ms)</CardTitle><DateRangePicker value={date} onChange={(value) => { if(value) { setDate(value); setActiveRangeLabel(""); } }} /></div></CardHeader>
                          <CardContent className="pt-6">
                            <div className="mb-4 flex items-center justify-between">
                              <div className="flex flex-wrap gap-2">
                                {MONITOR_CATEGORIES.map(category => (<Button key={category} variant={activeCategories.includes(category) ? "default" : "outline"} size="sm" onClick={() => handleCategoryClick(category)}>{category}</Button>))}
                              </div>
                              <div className="flex flex-wrap gap-2">
                                {timeRanges.map(({ label, value }) => (
                                  <Button
                                    key={label}
                                    variant={activeRangeLabel === label ? "default" : "outline"}
                                    size="sm"
                                    onClick={() => handleTimeRangeClick(value, label)}
                                  >
                                    {label}
                                  </Button>
                                ))}
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => setRefreshKey(prev => prev + 1)}
                                >
                                  刷新
                                </Button>
                              </div>
                            </div>
                            <div className="mb-4 flex flex-wrap gap-2">
                              {allLocations.map(location => (
                                <Button
                                  key={location}
                                  variant={activeLocations.includes(location) ? "default" : "outline"}
                                  size="sm"
                                  onClick={() => handleLocationClick(location)}
                                >
                                  {location}
                                </Button>
                              ))}
                            </div>
                            <div className="grid grid-cols-2 gap-px border-l border-t bg-border sm:grid-cols-3 lg:grid-cols-6">
                              {tcpingData.length > 0 && categoryFilteredMonitors.map(name => {
                                const latestDataPoint = tcpingData[tcpingData.length - 1];
                                const value = latestDataPoint?.[name];
                                const isActive = !activeMonitors || activeMonitors.includes(name);
                                return (
                                  <div key={name} className={`cursor-pointer p-3 text-center transition-opacity ${isActive ? 'bg-secondary opacity-100' : 'bg-background opacity-50 hover:opacity-75'}`} onClick={() => handleMonitorClick(name)}>
                                    <p className="truncate text-sm text-muted-foreground">{name}</p>
                                    <p className="text-xl font-bold">{value != null ? `${value.toFixed(2)}ms` : 'N/A'}</p>
                                  </div>
                                );
                              })}
                            </div>
                            {isLoadingTcping ? (<Skeleton className="h-[300px] w-full" />) : isDataInsufficient ? (
                              <div className="flex h-[300px] w-full items-center justify-center">
                                <p className="text-muted-foreground">{insufficientDataMessage || `当前数据量不足${activeRangeLabel || '所选范围'}无法显示，等待后台数据补充之后方可显示`}</p>
                              </div>
                            ) : (
                              <ChartContainer config={displayedMonitors.reduce((acc, name) => { const index = monitorNames.indexOf(name); acc[name] = { label: name, color: getDistinctColor(index) }; return acc; }, {} as ChartConfig)} className="aspect-auto h-[300px] w-full">
                                <AreaChart data={filteredTcpingData}>
                                  <defs>
                                    {monitorNames.map((name, index) => { const color = getDistinctColor(index); return (<linearGradient key={`color-${name}`} id={`color-${name}`} x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor={color} stopOpacity={0.8} /><stop offset="95%" stopColor={color} stopOpacity={0.1} /></linearGradient>); })}
                                  </defs>
                                  <CartesianGrid vertical={false} />
                                  <XAxis dataKey="created_at" tickLine={false} axisLine={false} tickMargin={8} minTickGap={32} type="number" scale="time" domain={['dataMin', 'dataMax']} tickFormatter={(unixTime) => new Date(unixTime).toLocaleTimeString('zh-CN', { timeZone: 'Asia/Shanghai', hour: '2-digit', minute: '2-digit' })} />
                                  <ChartTooltip cursor={true} content={<ChartTooltipContent labelFormatter={(value) => { if (typeof value !== 'number' || value === null) return '...'; const date = new Date(value); if (isNaN(date.getTime())) return 'Invalid Date'; return date.toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai', hour12: false }); }} indicator="dot" />} />
                                  <ChartLegend content={<ChartLegendContent />} />
                                  {displayedMonitors.map((name) => { const index = monitorNames.indexOf(name); return (<Area key={name} dataKey={name} type="natural" fill={`url(#color-${name})`} stroke={getDistinctColor(index)} stackId="a" animationDuration={300} />); })}
                                </AreaChart>
                              </ChartContainer>
                            )}
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
