import type { NativeChatMessage } from '../../native-chat-types'

export const asyncQuestionTitle =
  'После последних обновлений переустанавливалось приложение Orca на Android или обновлялась только сборка на компьютере? Это поможет проверить совместимость вызова Attach Photos.'

export const asyncQuestionOptions = [
  'Обновлялась только сборка на компьютере',
  'Обновлялись и компьютер, и приложение на Android'
]

export const asyncQuestionMessage: NativeChatMessage = {
  id: 'async-question',
  role: 'assistant',
  blocks: [
    { type: 'text', text: `${asyncQuestionTitle}\n- ${asyncQuestionOptions.join('\n- ')}` },
    {
      type: 'tool-call',
      name: 'request_user_input_async',
      callId: 'async-call',
      input: { questions: [{ title: asyncQuestionTitle, options: asyncQuestionOptions }] }
    }
  ],
  timestamp: 1,
  source: 'transcript'
}

export const orchestrationNoticeMessage: NativeChatMessage = {
  id: 'mail-notice',
  role: 'user',
  blocks: [{ type: 'text', text: 'You have 1 orchestration message.' }],
  from: {
    kind: 'agent',
    senders: [],
    orchestration: {
      message: 'mail-notice',
      mailbox: 'run:question-regression',
      dispatchId: null,
      messages: []
    }
  },
  timestamp: 2,
  source: 'transcript'
}
