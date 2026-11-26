import { toast } from 'sonner'
import { translate } from '@/i18n/i18n'
import type { ProjectOrderBy } from '../../../../../shared/ui-chrome/ui-chrome-types'

/** Saves a chosen project order through its runtime owner, which updates the store once saved. */
export function chooseProjectOrderMode(mode: ProjectOrderBy): void {
  void import('@/runtime/personal-project-order-client')
    .then(({ writeProjectOrderMode }) => writeProjectOrderMode(mode))
    .catch(() =>
      toast.error(translate('sidebar.projectOrder.saveFailed', 'Could not save project order'))
    )
}
