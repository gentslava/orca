import { translate } from '@/i18n/i18n'
import {
  CODE_HOST_FAILURE_COPY as EN,
  type CodeHostFailureCode
} from '../../../shared/code-host-failure-copy'

// null = required detail missing; caller shows the host's English `error`.
const COPY: Record<CodeHostFailureCode, (detail: string | null) => string | null> = {
  titleRequired: () => translate('codeHost.errors.titleRequired', EN.titleRequired),
  networkError: () => translate('codeHost.errors.networkError', EN.networkError),
  invalidUpdate: (detail) =>
    detail === null
      ? null
      : translate('codeHost.errors.invalidUpdate', EN.invalidUpdate, { detail }),
  invalidRequest: (detail) =>
    detail === null
      ? null
      : translate('codeHost.errors.invalidRequest', EN.invalidRequest, { detail }),
  issueNotFound: () => translate('codeHost.errors.issueNotFound', EN.issueNotFound),
  issueUpdateFailed: (detail) =>
    detail === null
      ? null
      : translate('codeHost.errors.issueUpdateFailed', EN.issueUpdateFailed, { detail }),
  'github.repoUnresolved': () =>
    translate('codeHost.errors.github.repoUnresolved', EN['github.repoUnresolved']),
  'github.unexpectedResponse': () =>
    translate('codeHost.errors.github.unexpectedResponse', EN['github.unexpectedResponse']),
  'github.pullRequestIdUnresolved': () =>
    translate(
      'codeHost.errors.github.pullRequestIdUnresolved',
      EN['github.pullRequestIdUnresolved']
    ),
  'github.reviewerRequired': () =>
    translate('codeHost.errors.github.reviewerRequired', EN['github.reviewerRequired']),
  'github.stackAutoMergeUnsupported': () =>
    translate(
      'codeHost.errors.github.stackAutoMergeUnsupported',
      EN['github.stackAutoMergeUnsupported']
    ),
  'github.autoMergeAlreadyMergeable': () =>
    translate(
      'codeHost.errors.github.autoMergeAlreadyMergeable',
      EN['github.autoMergeAlreadyMergeable']
    ),
  'github.noFailedChecks': () =>
    translate('codeHost.errors.github.noFailedChecks', EN['github.noFailedChecks']),
  'github.noRerunnableChecks': () =>
    translate('codeHost.errors.github.noRerunnableChecks', EN['github.noRerunnableChecks']),
  'github.stackMergeInvalidResponse': () =>
    translate(
      'codeHost.errors.github.stackMergeInvalidResponse',
      EN['github.stackMergeInvalidResponse']
    ),
  'github.stackMergePending': () =>
    translate('codeHost.errors.github.stackMergePending', EN['github.stackMergePending']),
  'github.rateLimited': () =>
    translate('codeHost.errors.github.rateLimited', EN['github.rateLimited']),
  'github.issuePermissionDenied': () =>
    translate('codeHost.errors.github.issuePermissionDenied', EN['github.issuePermissionDenied']),
  'github.issuesDisabled': () =>
    translate('codeHost.errors.github.issuesDisabled', EN['github.issuesDisabled']),
  'github.pullRequestPermissionDenied': () =>
    translate(
      'codeHost.errors.github.pullRequestPermissionDenied',
      EN['github.pullRequestPermissionDenied']
    ),
  'github.pullRequestNotFound': () =>
    translate('codeHost.errors.github.pullRequestNotFound', EN['github.pullRequestNotFound']),
  'github.pullRequestUpdateFailed': (detail) =>
    detail === null
      ? null
      : translate(
          'codeHost.errors.github.pullRequestUpdateFailed',
          EN['github.pullRequestUpdateFailed'],
          { detail }
        ),
  'github.autoMergeEnableFailed': (detail) =>
    detail === null
      ? null
      : translate(
          'codeHost.errors.github.autoMergeEnableFailed',
          EN['github.autoMergeEnableFailed'],
          { detail }
        ),
  'github.autoMergeDisableFailed': (detail) =>
    detail === null
      ? null
      : translate(
          'codeHost.errors.github.autoMergeDisableFailed',
          EN['github.autoMergeDisableFailed'],
          { detail }
        ),
  'github.mergeQueueAddFailed': (detail) =>
    detail === null
      ? null
      : translate('codeHost.errors.github.mergeQueueAddFailed', EN['github.mergeQueueAddFailed'], {
          detail
        }),
  'github.rerunPermissionDenied': () =>
    translate('codeHost.errors.github.rerunPermissionDenied', EN['github.rerunPermissionDenied']),
  'github.rerunTargetNotFound': () =>
    translate('codeHost.errors.github.rerunTargetNotFound', EN['github.rerunTargetNotFound']),
  'github.rerunRejected': (detail) =>
    detail === null
      ? null
      : translate('codeHost.errors.github.rerunRejected', EN['github.rerunRejected'], { detail }),
  'github.rerunFailed': (detail) =>
    detail === null
      ? null
      : translate('codeHost.errors.github.rerunFailed', EN['github.rerunFailed'], { detail }),
  'gitlab.projectUnresolved': () =>
    translate('codeHost.errors.gitlab.projectUnresolved', EN['gitlab.projectUnresolved']),
  'gitlab.unexpectedResponse': () =>
    translate('codeHost.errors.gitlab.unexpectedResponse', EN['gitlab.unexpectedResponse']),
  'gitlab.commentBodyRequired': () =>
    translate('codeHost.errors.gitlab.commentBodyRequired', EN['gitlab.commentBodyRequired']),
  'gitlab.discussionIdRequired': () =>
    translate('codeHost.errors.gitlab.discussionIdRequired', EN['gitlab.discussionIdRequired']),
  'gitlab.readyTitleConflict': () =>
    translate('codeHost.errors.gitlab.readyTitleConflict', EN['gitlab.readyTitleConflict']),
  'gitlab.mergeRequestTitleUnreadable': () =>
    translate(
      'codeHost.errors.gitlab.mergeRequestTitleUnreadable',
      EN['gitlab.mergeRequestTitleUnreadable']
    ),
  'gitlab.rateLimited': () =>
    translate('codeHost.errors.gitlab.rateLimited', EN['gitlab.rateLimited']),
  'gitlab.issuePermissionDenied': () =>
    translate('codeHost.errors.gitlab.issuePermissionDenied', EN['gitlab.issuePermissionDenied']),
  'gitlab.jobLogPermissionDenied': () =>
    translate('codeHost.errors.gitlab.jobLogPermissionDenied', EN['gitlab.jobLogPermissionDenied']),
  'gitlab.jobProjectNotFound': () =>
    translate('codeHost.errors.gitlab.jobProjectNotFound', EN['gitlab.jobProjectNotFound']),
  'gitlab.jobLogFailed': (detail) =>
    detail === null
      ? null
      : translate('codeHost.errors.gitlab.jobLogFailed', EN['gitlab.jobLogFailed'], { detail })
}

function isCodeHostFailureCode(code: unknown): code is CodeHostFailureCode {
  return typeof code === 'string' && Object.hasOwn(COPY, code)
}

type CodeHostFailureLike = { errorCode?: unknown; errorDetail?: unknown }

/** GitHub/GitLab operation failure text; uncoded (older host) or unknown (newer host) results show the English `error`. */
export function codeHostErrorText(failure: CodeHostFailureLike & { error: string }): string
export function codeHostErrorText(
  failure: CodeHostFailureLike & { error?: string }
): string | undefined
export function codeHostErrorText(
  failure: CodeHostFailureLike & { error?: string }
): string | undefined {
  if (!isCodeHostFailureCode(failure.errorCode)) {
    return failure.error
  }
  const detail = typeof failure.errorDetail === 'string' ? failure.errorDetail : null
  return COPY[failure.errorCode](detail) ?? failure.error
}
