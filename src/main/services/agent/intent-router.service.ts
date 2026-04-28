import log from 'electron-log';

const logger = log.scope('intent-router');

export type IntentTier = 't1' | 't2';

export interface IntentDecision {
  tier: IntentTier;
  reason: string;
}

const TOOL_TRIGGERS: Array<{ pattern: RegExp; reason: string }> = [
  { pattern: /https?:\/\/|www\.|\.com\b|\.cn\b|\.io\b|\.org\b|\.net\b/i, reason: 'url' },
  { pattern: /(网页|网址|链接|这个页|这篇文章|抓取|爬取|抓一下)/, reason: 'web' },
  { pattern: /(飞书|lark|多维表格|bitable|飞书文档|飞书群|飞书任务|飞书表格)/i, reason: 'lark' },
  { pattern: /(打开|跳转|访问|浏览|登录).{0,20}(网站|页面|链接)/, reason: 'browse' },
  { pattern: /(发送|发给|发到|推送).{0,15}(群|频道|消息|chat|im)/i, reason: 'send-msg' },
  { pattern: /(创建|新建|生成).{0,15}(文档|文件|表格|目录)/, reason: 'create-doc' },
  { pattern: /(读取|读一下|打开).{0,15}(文件|文档|目录|路径)/, reason: 'read-file' },
  { pattern: /(执行|运行).{0,15}(命令|脚本|shell|bash)/i, reason: 'shell' },
  { pattern: /(搜索|查一下).{0,15}(网|google|百度|bing|tavily)/i, reason: 'search' },
];

const T1_SIGNALS: Array<{ pattern: RegExp; reason: string }> = [
  { pattern: /^(什么是|是什么|怎么|如何|为什么|为啥|多少|几|哪个|哪里|何时)/, reason: 'q-word' },
  { pattern: /\?$|？$/, reason: 'question-mark' },
  { pattern: /(解释|说明|定义|介绍).{0,15}(一下|下)/, reason: 'explain' },
  { pattern: /(翻译|改写|润色|总结).{0,30}/, reason: 'text-task' },
];

const T1_MAX_LENGTH = 240;

export class IntentRouter {
  classify(prompt: string): IntentDecision {
    const text = prompt.trim();

    for (const trigger of TOOL_TRIGGERS) {
      if (trigger.pattern.test(text)) {
        return { tier: 't2', reason: `tool:${trigger.reason}` };
      }
    }

    if (text.length > T1_MAX_LENGTH) {
      return { tier: 't2', reason: 'long-prompt' };
    }

    for (const signal of T1_SIGNALS) {
      if (signal.pattern.test(text)) {
        return { tier: 't1', reason: `qa:${signal.reason}` };
      }
    }

    if (text.length <= 80) {
      return { tier: 't1', reason: 'short-no-tool' };
    }

    return { tier: 't2', reason: 'default-agent' };
  }
}

export const intentRouter = new IntentRouter();

export function logIntentDecision(prompt: string, decision: IntentDecision): void {
  logger.info('Intent routed', {
    tier: decision.tier,
    reason: decision.reason,
    length: prompt.length,
    preview: prompt.slice(0, 60),
  });
}
