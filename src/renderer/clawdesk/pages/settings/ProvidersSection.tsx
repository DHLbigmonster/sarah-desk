import type { ClawDeskProviderSummaryItem } from '../../../../shared/types/clawdesk-settings';
import { Badge } from '../../components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/card';

export function ProvidersSection({ providers }: { providers: ClawDeskProviderSummaryItem[] }) {
  return (
    <div className="space-y-6">
      <div className="grid gap-4 xl:grid-cols-2">
        {providers.map((provider) => (
          <Card key={provider.id}>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center justify-between gap-3 text-base">
                <span>{provider.label}</span>
                <Badge variant={provider.configured ? 'secondary' : 'outline'}>
                  {provider.configured ? 'Configured' : 'Missing'}
                </Badge>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="text-sm font-medium text-foreground">{provider.provider}</div>
              <div className="text-sm leading-6 text-muted-foreground">{provider.detail}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">后续预留</CardTitle>
        </CardHeader>
        <CardContent className="text-sm leading-6 text-muted-foreground">
          服务商页这一轮只做摘要，不做复杂密钥管理和表单编辑。你现在已经明确有"语音服务商"和"小文本处理服务商"，这两个入口后面可以继续在这里加深。
        </CardContent>
      </Card>
    </div>
  );
}
