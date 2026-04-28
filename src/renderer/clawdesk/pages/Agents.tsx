import { Bot } from 'lucide-react';
import { BrandIcon } from '../components/ui/BrandIcon';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';

const PLANNED_FEATURES = [
  { title: 'Agent 配置', desc: '管理已安装的 OpenClaw agent 及其配置参数' },
  { title: '执行链路', desc: '查看 Command / Quick Ask 的 agent 执行链路与日志' },
  { title: 'Agent 市场', desc: '浏览和安装社区提供的 agent 模板（后续版本）' },
];

export function Agents() {
  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Agents</h1>
        <p className="mt-1 text-sm text-muted-foreground">OpenClaw agent 管理与配置</p>
      </div>

      <div className="flex flex-col items-center justify-center gap-6 rounded-2xl border border-dashed border-border bg-card/30 py-16">
        <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-accent">
          <Bot className="h-8 w-8 text-accent-foreground" />
        </div>
        <div className="text-center">
          <h2 className="text-lg font-semibold">Agent 管理</h2>
          <p className="mt-2 max-w-sm text-sm text-muted-foreground">
            当前通过{' '}
            <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs">
              openclaw agent --agent main
            </code>{' '}
            直接执行。可视化管理界面将在后续版本提供。
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
