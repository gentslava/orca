import { BookOpen } from 'lucide-react'
import { useAppStore } from '@/store'
import { translate } from '@/i18n/i18n'
import { useActiveProjectSkillRuntime } from '@/hooks/useActiveProjectSkillRuntime'
import { bundledSkillTargetKey, type BundledSkillTarget } from '@/lib/bundled-skill-target'
import { Button } from '../ui/button'

export function ManageInstalledSkillsButton({
  target
}: {
  target?: BundledSkillTarget | null
}): React.JSX.Element | null {
  const openSkillsPage = useAppStore((state) => state.openSkillsPage)
  const active = useActiveProjectSkillRuntime().bundledSkillTarget
  // The existing manager follows the active host; never send another host's card there.
  if (
    !active ||
    active.kind === 'ssh' ||
    (target !== undefined &&
      (!target || bundledSkillTargetKey(target) !== bundledSkillTargetKey(active)))
  ) {
    return null
  }
  return (
    <Button type="button" variant="ghost" size="sm" onClick={openSkillsPage}>
      <BookOpen className="size-3.5" />
      {translate('auto.components.settings.shareSkills.openSkills', 'Open Skills')}
    </Button>
  )
}
