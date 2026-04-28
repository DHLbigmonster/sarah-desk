import { Clock } from 'lucide-react';
import { BrandIcon } from '../components/ui/BrandIcon';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';

const PLANNED_FEATURES = [
  { title: '定时任务', desc: '配置定时触发 agent 的 cron 任务，支持 cron 表达式' },
  { title: '任务历史', desc: '查看 cron 任务的执行历史与结果记录' },
  { title: '任务管理', desc: '启用、禁用、删除和编辑已配置的定时任务' },
];

export function Cron() {
  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Cron</h1>
        <p className="mt-1 text-sm text-muted-foreground">定时任务配置与管理</p>
      </div>

      <div className="flex flex-col items-center justify-center gap-6 rounded-2xl border border-dashed border-border bg-card/30 py-16">
        <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-accent">
          <Clock className="h-8 w-8 text-accent-foreground" />
        </div>
        <div className="text-center">
          <h2 className="text-lg font-semibold">定时任务</h2>
          <p className="mt-2 max-w-sm text-sm text-muted-foreground">
            定时任务管理将在后续版本提供，允许你配置在指定时间自动触发的 agent 任务。
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
