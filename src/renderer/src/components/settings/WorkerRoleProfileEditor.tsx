import { getAgentCatalog } from '@/lib/agent-catalog'
import { translate } from '@/i18n/i18n'
import {
  findCatalogModel,
  findCatalogOption
} from '../../../../shared/agent-session-option-catalog'
import type { WorkerRoleProfile } from '../../../../shared/orchestration-worker-roles'
import { useWorkerRoleModelCatalog } from './use-worker-role-model-catalog'
import { nativeChatSessionChoiceLabel } from '../native-chat/native-chat-session-option-labels'
import { Label } from '../ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select'

const INHERIT = '_inherit'

export function WorkerRoleProfileEditor({
  role,
  profile,
  disabled,
  disabledAgents,
  structuredFast,
  onChange
}: {
  role: string
  profile: WorkerRoleProfile | undefined
  disabled: boolean
  disabledAgents: readonly string[]
  structuredFast: boolean
  onChange: (profile: WorkerRoleProfile | undefined) => void
}): React.JSX.Element {
  const agents = getAgentCatalog().filter((agent) => !disabledAgents.includes(agent.id))
  const catalog = useWorkerRoleModelCatalog(profile?.agent)
  const models = catalog?.supportsWorkerLaunchPreferences ? catalog.models : []
  const model = catalog && profile?.model ? findCatalogModel(catalog, profile.model) : undefined
  const effort = findCatalogOption(model, 'effort')
  const fast = findCatalogOption(model, 'fastMode')
  const supportsFast =
    (fast?.kind.type === 'boolean' && (fast.apply.launchArgs || fast.apply.composedIntoModel)) ||
    (structuredFast && Boolean(profile?.model))
  const writeOption = (key: 'model' | 'effort' | 'fastMode', value: string) => {
    if (!profile) {
      return
    }
    const next = { ...profile }
    if (key === 'model') {
      delete next.effort
      delete next.fastMode
    }
    if (value === INHERIT) {
      delete next[key]
    } else if (key === 'fastMode') {
      next.fastMode = value === 'on'
    } else {
      next[key] = value
    }
    onChange(next)
  }

  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <div className="space-y-1">
        <Label htmlFor={`worker-role-${role}-agent`}>
          {translate('settings.orchestration.roles.agent', 'Agent')}
        </Label>
        <Select
          value={profile?.agent ?? INHERIT}
          disabled={disabled}
          onValueChange={(agent) => onChange(agent === INHERIT ? undefined : { agent })}
        >
          <SelectTrigger id={`worker-role-${role}-agent`}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={INHERIT}>
              {translate('settings.orchestration.roles.unconfigured', 'Not configured')}
            </SelectItem>
            {profile && !agents.some((agent) => agent.id === profile.agent) ? (
              <SelectItem value={profile.agent}>{profile.agent}</SelectItem>
            ) : null}
            {agents.map((agent) => (
              <SelectItem key={agent.id} value={agent.id}>
                {agent.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-1">
        <Label htmlFor={`worker-role-${role}-model`}>
          {translate('settings.orchestration.roles.model', 'Model')}
        </Label>
        <Select
          value={profile?.model ?? INHERIT}
          disabled={disabled || !profile || models.length === 0}
          onValueChange={(value) => writeOption('model', value)}
        >
          <SelectTrigger id={`worker-role-${role}-model`}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={INHERIT}>
              {translate('settings.orchestration.roles.agentDefault', 'Agent default')}
            </SelectItem>
            {profile?.model && !models.some((candidate) => candidate.id === profile.model) ? (
              <SelectItem value={profile.model}>{profile.model}</SelectItem>
            ) : null}
            {models.map((candidate) => (
              <SelectItem key={candidate.id} value={candidate.id}>
                {candidate.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-1">
        <Label htmlFor={`worker-role-${role}-effort`}>
          {translate('settings.orchestration.roles.effort', 'Reasoning effort')}
        </Label>
        <Select
          value={profile?.effort ?? INHERIT}
          disabled={disabled || effort?.kind.type !== 'select'}
          onValueChange={(value) => writeOption('effort', value)}
        >
          <SelectTrigger id={`worker-role-${role}-effort`}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={INHERIT}>
              {translate('settings.orchestration.roles.agentDefault', 'Agent default')}
            </SelectItem>
            {effort?.kind.type === 'select'
              ? effort.kind.choices.map((choice) => (
                  <SelectItem key={choice.value} value={choice.value}>
                    {nativeChatSessionChoiceLabel(choice)}
                  </SelectItem>
                ))
              : null}
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-1">
        <Label htmlFor={`worker-role-${role}-fast`}>
          {translate('settings.orchestration.roles.fast', 'Fast')}
        </Label>
        <Select
          value={profile?.fastMode === undefined ? INHERIT : profile.fastMode ? 'on' : 'off'}
          disabled={disabled || !supportsFast}
          onValueChange={(value) => writeOption('fastMode', value)}
        >
          <SelectTrigger id={`worker-role-${role}-fast`}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={INHERIT}>
              {translate('settings.orchestration.roles.agentDefault', 'Agent default')}
            </SelectItem>
            <SelectItem value="on">{translate('settings.orchestration.roles.on', 'On')}</SelectItem>
            <SelectItem value="off">
              {translate('settings.orchestration.roles.off', 'Off')}
            </SelectItem>
          </SelectContent>
        </Select>
      </div>
    </div>
  )
}
