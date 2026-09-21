import type { BlogMode } from '../api/siteConfig';

/** Copy for admin Blog mode settings — keep UI free of hardcoded strings. */
export const blogSettingsCopy = {
  sectionTitle: 'Blog',
  sectionDescription:
    'Choose how the public blog works on your site. Existing posts are kept even if you turn the blog off.',

  modes: {
    off: {
      label: 'Off',
      description:
        'You do not want a blog. The blog section is hidden from the public site. Existing posts are kept.',
    },
    manual: {
      label: 'Manual',
      description: 'You manage posts yourself from the admin panel.',
    },
    auto: {
      label: 'Auto',
      description:
        'We create and publish posts for you (add-on service). Activation is confirmed separately — choosing Auto does not mean it is live yet.',
    },
  } satisfies Record<
    BlogMode,
    { label: string; description: string }
  >,

  notices: {
    requested:
      'Request sent. Until it is activated, your blog runs in manual mode.',
    active: 'Service active.',
    past_due:
      'Payment pending. Your blog runs in manual mode until the add-on is active again.',
  },

  effectiveHint: (effective: BlogMode) =>
    `Currently serving visitors as: ${
      effective === 'off' ? 'Off' : effective === 'manual' ? 'Manual' : 'Auto'
    }.`,

  confirmOff:
    'Turn off the public blog? The Blog link and pages will be hidden. Existing posts are kept and you can turn it back on later.',

  save: 'Save blog mode',
  saving: 'Saving…',
  saved: 'Blog mode saved.',
  loadError: 'Could not load blog settings.',
  saveError: 'Could not save blog mode. Please try again.',
  loading: 'Loading blog settings…',
} as const;

export const blogAdminCopy = {
  navLabel: 'Blogs',
  disabledTitle: 'Blog is disabled',
  disabledBody:
    'The public blog is turned off. Turn it on in Settings to manage posts again.',
  disabledCta: 'Open Settings',
  syncedBadge: 'Sincronizado',
  syncedReadOnlyHint: 'This post is managed by the platform and cannot be edited here.',
  managedByPlatform:
    'This post is managed by the platform and cannot be changed while Auto mode is active.',
  blogDisabledError: 'Blog is disabled. Enable it in Settings to continue.',
} as const;
