import { api } from './client';
import type { BlogMode } from './siteConfig';

export type AutoAddonStatus = 'inactive' | 'requested' | 'active' | 'past_due';

export interface AdminBlogSettings {
  ok: boolean;
  blog_mode: BlogMode;
  effective_mode: BlogMode;
  auto_addon_status: AutoAddonStatus;
  entitled: boolean;
}

export async function getAdminBlogSettings(): Promise<AdminBlogSettings> {
  return api<AdminBlogSettings>('/api/admin/settings/blog');
}

export async function putAdminBlogSettings(
  blog_mode: BlogMode,
): Promise<AdminBlogSettings> {
  return api<AdminBlogSettings>('/api/admin/settings/blog', {
    method: 'PUT',
    body: JSON.stringify({ blog_mode }),
  });
}
