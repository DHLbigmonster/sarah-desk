import { Radio } from 'lucide-react';
import { BrandIcon } from '../components/ui/BrandIcon';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';

const PLANNED_FEATURES = [
  { title: '输入通道', desc: '管理语音、键盘、API 等不同输入触发方式的通道配置' },
  { title: '输出通道', desc: '配置文本插入、剪贴板、通知等不同结果输出方式' },
  { title: '通道路由', desc: '定义不同触发方式与 agent 处理流程的路由规则' },
];

export function Channels() {
  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Channels</h1>
        <p className="mt-1 text-sm text-muted-foreground">输入输出通道配置与路由管理</p>
      </div>

      <div className="flex flex-col items-center justify-center gap-6 rounded-2xl border border-dashed border-border bg-card/30 py-16">
        <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-accent">
          <Radio className="h-8 w-8 text-accent-foreground" />
        </div>
        <div className="text-center">
          <h2 className="text-lg font-semibold">通道管理</h2>
          <p className="mt-2 max-w-sm text-sm text-muted-foreground">
            当前通道通过硬编码热键（Right Ctrl 系列）管理。可视化通道配置将在后续版本提供。
          </p>
        </div>
        <div className="grid w-full max-w-xl gap-3 px-6 sm:grid-cols-3">
          {PLANNED_FEATURES.map((f) => (
            <Card key={f.title} className="border-dashed bg-card/50">
              <CardHeader className="pb-2 pt-4">
                <CardTitle className="flex items-center gap-2 text-sm">
                  <BrandIcon size={14} variant="tray" className="text-muted-foreground" />
                  {f.title}
                </CardTitle>
              </CardHeader>
              <CardContent className="pb-4">
                <p className="text-xs leading-5 text-muted-foreground">{f.desc}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </div>
  );
}
