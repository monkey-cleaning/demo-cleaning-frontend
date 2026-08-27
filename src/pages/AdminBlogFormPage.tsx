import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { API_BASE_URL } from '../api/client';
import { supabase } from '../lib/supabaseClient';
import ReactQuill from 'react-quill';
import 'react-quill/dist/quill.snow.css';

const quillModules = {
  toolbar: [
    [{ header: [1, 2, 3, false] }],
    ['bold', 'italic', 'underline', 'strike'],
    [{ color: [] }, { background: [] }],
    [{ list: 'ordered' }, { list: 'bullet' }],
    [{ align: [] }],
    ['link'],
    ['clean'],
  ],
};

const quillFormats = [
  'header',
  'bold',
  'italic',
  'underline',
  'strike',
  'color',
  'background',
  'list',
  'bullet',
  'align',
  'link',
];

type SectionForm = {
  id?: number;
  order: number;
  heading: string;
  body: string;           
  body_html: string;      
  image_url: string | null;
  image_alt: string;
};

type AdminBlogDetail = {
  post: {
    id: number;
    slug: string;
    title: string;
    excerpt: string;
    hero_image_url: string | null;
    hero_image_alt: string | null;
    tag: string | null;
    author: string | null;
    status: 'draft' | 'published';
    published_at: string | null;
    seo_title: string | null;
    seo_description: string | null;
  };
  sections: {
    id: number;
    section_order: number;
    heading: string;
    body: string | null;
    body_html: string | null;
    image_url: string | null;
    image_alt: string | null;
  }[];
};

const BUCKET = import.meta.env.VITE_SUPABASE_BLOG_BUCKET as string;

export default function AdminBlogFormPage() {
  const { id } = useParams<{ id: string }>();
  const isEdit = Boolean(id) && id !== 'new';
  const navigate = useNavigate();

  const [slug, setSlug] = useState('');
  const [title, setTitle] = useState('');
  const [excerpt, setExcerpt] = useState('');
  const [heroImageUrl, setHeroImageUrl] = useState<string | null>(null);
  const [heroImageAlt, setHeroImageAlt] = useState('');
  const [tag, setTag] = useState('');
  const [author, setAuthor] = useState('');
  const [status, setStatus] = useState<'draft' | 'published'>('draft');
  const [publishedAt, setPublishedAt] = useState('');
  const [seoTitle, setSeoTitle] = useState('');
  const [seoDescription, setSeoDescription] = useState('');
  const [sections, setSections] = useState<SectionForm[]>([]);
  const [loading, setLoading] = useState(isEdit);
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<{ [key: string]: string }>({});

  // Carga de datos si es edición
  useEffect(() => {
    if (!isEdit) return;

    const load = async () => {
      try {
        const token = localStorage.getItem('admin_blog_token');
        const response = await fetch(`${API_BASE_URL}/api/admin/blogs/${id}`, {
          headers: token ? { Authorization: `Bearer ${token}` } : {}
        });

        if (!response.ok) {
          throw new Error('Error fetching blog post');
        }

        const data: AdminBlogDetail = await response.json();
        const p = data.post;

        setSlug(p.slug);
        setTitle(p.title);
        setExcerpt(p.excerpt);
        setHeroImageUrl(p.hero_image_url);
        setHeroImageAlt(p.hero_image_alt ?? '');
        setTag(p.tag ?? '');
        setAuthor(p.author ?? '');
        setStatus(p.status);
        setPublishedAt(
          p.published_at
            ? new Date(p.published_at).toISOString().slice(0, 16)
            : ''
        );
        setSeoTitle(p.seo_title ?? '');
        setSeoDescription(p.seo_description ?? '');
        setSections(
          data.sections.map((s) => ({
            id: s.id,
            order: s.section_order,
            heading: s.heading,
            body: s.body ?? '',
            body_html: s.body_html ?? '',
            image_url: s.image_url,
            image_alt: s.image_alt ?? '',
          }))
        );
      } catch (e) {
        console.error(e);
        alert('Error loading post');
      } finally {
        setLoading(false);
      }
    };

    load();
  }, [id, isEdit]);

  const handleAddSection = () => {
    const nextOrder =
      sections.length > 0 ? Math.max(...sections.map((s) => s.order)) + 1 : 1;

    setSections((prev) => [
      ...prev,
      {
        order: nextOrder,
        heading: '',
        body: '',
        body_html: '',
        image_url: null,
        image_alt: '',
      },
    ]);
    // Clear section error when adding one
    setErrors(prev => ({ ...prev, sections: '' }));
  };

  const handleChangeSection = (
    index: number,
    field: keyof SectionForm,
    value: any
  ) => {
    setSections((prev) =>
      prev.map((s, i) => (i === index ? { ...s, [field]: value } : s))
    );
  };

  const handleRemoveSection = (index: number) => {
    setSections((prev) => prev.filter((_, i) => i !== index));
  };

  // Form validation
  const validateForm = (): boolean => {
    const newErrors: { [key: string]: string } = {};

    // Validate basic fields
    if (!title.trim()) newErrors.title = 'Title is required';
    if (!slug.trim()) newErrors.slug = 'Slug is required';
    if (!excerpt.trim()) newErrors.excerpt = 'Excerpt is required';
    if (!tag.trim()) newErrors.tag = 'Tag is required';
    if (!author.trim()) newErrors.author = 'Author is required';

    // Validate sections
    if (sections.length === 0) {
      newErrors.sections = 'At least one section is required';
    } else {
      // Validate each section
      sections.forEach((section, index) => {
        if (index === 0) {
          // Intro section - heading is optional, body is required
          if (!section.body.trim()) {
            newErrors[`section_${index}_body`] = 'Intro content is required';
          }
        } else {
          // Regular sections - heading and body_html are required
          if (!section.heading.trim()) {
            newErrors[`section_${index}_heading`] = `Section ${index} heading is required`;
          }
          if (!section.body_html.trim()) {
            newErrors[`section_${index}_body`] = `Section ${index} content is required`;
          }
        }
      });
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  // Upload image to bucket
  const uploadImage = async (
    file: File,
    folder: 'hero' | 'section',
    sectionIndex?: number
  ) => {
    if (!BUCKET) {
      alert('VITE_SUPABASE_BLOG_BUCKET is not configured');
      return;
    }

    const filename = `${folder}-${Date.now()}-${file.name}`;
    const path = `${folder}/${filename}`;

    const { error } = await supabase.storage.from(BUCKET).upload(path, file, {
      upsert: true,
    });

    if (error) {
      console.error(error);
      alert('Error uploading image');
      return;
    }

    const {
      data: { publicUrl },
    } = supabase.storage.from(BUCKET).getPublicUrl(path);

    if (folder === 'hero') {
      setHeroImageUrl(publicUrl);
    } else if (folder === 'section' && sectionIndex !== undefined) {
      handleChangeSection(sectionIndex, 'image_url', publicUrl);
    }
  };

  const handleSave = async () => {
    // Validate before saving
    if (!validateForm()) {
      alert('Please fix the errors before saving');
      return;
    }

    setSaving(true);

    try {
      const token = localStorage.getItem('admin_blog_token');
      const payload = {
        slug,
        title,
        excerpt,
        heroImageUrl,
        heroImageAlt,
        tag,
        author,
        status,
        publishedAt: publishedAt ? new Date(publishedAt).toISOString() : null,
        seoTitle,
        seoDescription,
        sections: sections.map((s, idx) => ({
          order: s.order ?? idx + 1,
          heading: s.heading,
          body: s.body,
          body_html: s.body_html,
          image_url: s.image_url,
          image_alt: s.image_alt,
        })),
      };

      const url = isEdit 
        ? `${API_BASE_URL}/api/admin/blogs/${id}`
        : `${API_BASE_URL}/api/admin/blogs`;

      const response = await fetch(url, {
        method: isEdit ? 'PUT' : 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {})
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || `Error ${response.status}`);
      }

      navigate('/admin/blogs');
    } catch (e: any) {
      console.error(e);
      alert(e.message || 'Error saving the post');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <div className="p-8 text-center text-gray-500">Loading...</div>;
  }

  return (
    <div className="min-h-screen bg-gray-50 py-10">
      <div className="max-w-4xl mx-auto px-4 space-y-8">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-montserrat font-bold text-[#031634]">
            {isEdit ? 'Edit Post' : 'New Post'}
          </h1>
          <button
            onClick={() => navigate('/admin/blogs')}
            className="text-sm text-gray-500 underline"
          >
            Back to list
          </button>
        </div>

        {/* Main data */}
        <div className="bg-white rounded-lg shadow-sm p-6 space-y-4">
          <div className="grid md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1">Title *</label>
              <input
                className={`w-full border rounded-md px-3 py-2 text-sm ${
                  errors.title ? 'border-red-500' : ''
                }`}
                value={title}
                onChange={(e) => {
                  setTitle(e.target.value);
                  if (errors.title) setErrors(prev => ({ ...prev, title: '' }));
                }}
              />
              {errors.title && (
                <p className="text-red-500 text-xs mt-1">{errors.title}</p>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">Slug (URL) *</label>
              <input
                className={`w-full border rounded-md px-3 py-2 text-sm ${
                  errors.slug ? 'border-red-500' : ''
                }`}
                value={slug}
                onChange={(e) => {
                  setSlug(e.target.value);
                  if (errors.slug) setErrors(prev => ({ ...prev, slug: '' }));
                }}
                placeholder="the-ultimate-guide-to..."
              />
              {errors.slug && (
                <p className="text-red-500 text-xs mt-1">{errors.slug}</p>
              )}
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">Excerpt *</label>
            <textarea
              className={`w-full border rounded-md px-3 py-2 text-sm ${
                errors.excerpt ? 'border-red-500' : ''
              }`}
              rows={3}
              value={excerpt}
              onChange={(e) => {
                setExcerpt(e.target.value);
                if (errors.excerpt) setErrors(prev => ({ ...prev, excerpt: '' }));
              }}
              placeholder="Brief summary that appears in blog cards and search results"
            />
            {errors.excerpt && (
              <p className="text-red-500 text-xs mt-1">{errors.excerpt}</p>
            )}
          </div>

          {/* SEO fields */}
          <div className="grid md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1">
                SEO Title (optional)
              </label>
              <input
                className="w-full border rounded-md px-3 py-2 text-sm"
                value={seoTitle}
                onChange={(e) => setSeoTitle(e.target.value)}
                placeholder="Definitive guide to cleaning for Airbnb in Victoria, BC"
              />
              <p className="text-xs text-gray-500 mt-1">
                If you leave it empty, we use the normal title.
              </p>
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">
                SEO Description
              </label>
              <textarea
                className="w-full border rounded-md px-3 py-2 text-sm"
                rows={3}
                value={seoDescription}
                onChange={(e) => setSeoDescription(e.target.value)}
                placeholder="Learn how to keep your Airbnb in Victoria always spotless, improve your reviews and increase your occupancy."
              />
              <p className="text-xs text-gray-500 mt-1">
                Summary of 1–2 lines that will appear in Google.
              </p>
            </div>
          </div>

          <div className="grid md:grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1">Tag *</label>
              <input
                className={`w-full border rounded-md px-3 py-2 text-sm ${
                  errors.tag ? 'border-red-500' : ''
                }`}
                value={tag}
                onChange={(e) => {
                  setTag(e.target.value);
                  if (errors.tag) setErrors(prev => ({ ...prev, tag: '' }));
                }}
                placeholder="Vacation Rental / Airbnb"
              />
              {errors.tag && (
                <p className="text-red-500 text-xs mt-1">{errors.tag}</p>
              )}
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Author *</label>
              <input
                className={`w-full border rounded-md px-3 py-2 text-sm ${
                  errors.author ? 'border-red-500' : ''
                }`}
                value={author}
                onChange={(e) => {
                  setAuthor(e.target.value);
                  if (errors.author) setErrors(prev => ({ ...prev, author: '' }));
                }}
                placeholder="Demo Cleaning Co. Team"
              />
              {errors.author && (
                <p className="text-red-500 text-xs mt-1">{errors.author}</p>
              )}
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">
                Status / Published at
              </label>
              <div className="flex gap-2">
                <select
                  className="border rounded-md px-2 py-2 text-sm"
                  value={status}
                  onChange={(e) =>
                    setStatus(e.target.value as 'draft' | 'published')
                  }
                >
                  <option value="draft">Draft</option>
                  <option value="published">Published</option>
                </select>
                <input
                  type="datetime-local"
                  className="border rounded-md px-2 py-2 text-xs flex-1"
                  value={publishedAt}
                  onChange={(e) => setPublishedAt(e.target.value)}
                />
              </div>
            </div>
          </div>

          {/* Hero image */}
          <div className="mt-4">
            <label className="block text-sm font-medium mb-1">
              Hero Image (Supabase)
            </label>
            <div className="flex items-center gap-4">
              <input
                type="file"
                accept="image/*"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) uploadImage(file, 'hero');
                }}
              />
              {heroImageUrl && (
                <img
                  src={heroImageUrl}
                  alt={heroImageAlt || 'Hero image preview'}
                  className="w-24 h-16 object-cover rounded-md border"
                />
              )}
            </div>

            <div className="mt-2">
              <label className="block text-xs font-medium mb-1">
                Image alt (SEO)
              </label>
              <input
                className="w-full border rounded-md px-2 py-1 text-sm"
                value={heroImageAlt}
                onChange={(e) => setHeroImageAlt(e.target.value)}
                placeholder="Professional cleaning team preparing an Airbnb in Victoria, BC"
              />
            </div>
          </div>
        </div>

        {/* Sections */}
        <div className="bg-white rounded-lg shadow-sm p-6 space-y-4">
          <div className="flex items-center justify-between mb-2">
            <h2 className="text-lg font-montserrat font-semibold">
              Sections of the post *
            </h2>
            <button
              type="button"
              onClick={handleAddSection}
              className="px-3 py-1 text-sm rounded-md bg-[#031634] text-white"
            >
              + Add section
            </button>
          </div>

          {errors.sections && (
            <p className="text-red-500 text-sm bg-red-50 p-2 rounded">
              {errors.sections}
            </p>
          )}

          {sections.length === 0 && (
            <p className="text-sm text-gray-500">
              No sections yet. Add at least 1 section.
            </p>
          )}

          <div className="space-y-6">
            {sections.map((sec, index) => (
              <div
                key={index}
                className="border rounded-md p-4 space-y-3 bg-gray-50"
              >
                <div className="flex items-center justify-between">
                  <span className="text-sm font-semibold">
                    {index === 0 ? 'Intro Section' : `Section ${sec.order}`}
                  </span>
                  <button
                    type="button"
                    className="text-xs text-red-500"
                    onClick={() => handleRemoveSection(index)}
                  >
                    Delete
                  </button>
                </div>

                <div className="grid md:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium mb-1">
                      Title {index === 0 ? '(optional)' : '*'}
                    </label>
                    <input
                      className={`w-full border rounded-md px-2 py-1 text-sm ${
                        errors[`section_${index}_heading`] ? 'border-red-500' : ''
                      }`}
                      value={sec.heading}
                      onChange={(e) => {
                        handleChangeSection(index, 'heading', e.target.value);
                        if (errors[`section_${index}_heading`]) {
                          setErrors(prev => ({ ...prev, [`section_${index}_heading`]: '' }));
                        }
                      }}
                      placeholder={index === 0 ? "Introduction (optional)" : "Section title"}
                    />
                    {errors[`section_${index}_heading`] && (
                      <p className="text-red-500 text-xs mt-1">
                        {errors[`section_${index}_heading`]}
                      </p>
                    )}
                  </div>
                  <div>
                    <label className="block text-xs font-medium mb-1">
                      Order
                    </label>
                    <input
                      type="number"
                      className="w-full border rounded-md px-2 py-1 text-sm"
                      value={sec.order}
                      onChange={(e) =>
                        handleChangeSection(
                          index,
                          'order',
                          Number(e.target.value)
                        )
                      }
                    />
                  </div>
                </div>

                {/* Intro Section - Simple Textarea */}
                {index === 0 && (
                  <div>
                    <label className="block text-xs font-medium mb-1">
                      Intro (text that appears before the sections) *
                    </label>
                    <textarea
                      className={`w-full border rounded-md px-3 py-2 text-sm ${
                        errors[`section_${index}_body`] ? 'border-red-500' : ''
                      }`}
                      rows={4}
                      value={sec.body}
                      onChange={(e) => {
                        handleChangeSection(index, "body", e.target.value);
                        if (errors[`section_${index}_body`]) {
                          setErrors(prev => ({ ...prev, [`section_${index}_body`]: '' }));
                        }
                      }}
                      placeholder="Introductory text of the article..."
                    />
                    <p className="text-[11px] text-gray-500 mt-1">
                      This text appears above section 1, before the main content sections.
                    </p>
                    {errors[`section_${index}_body`] && (
                      <p className="text-red-500 text-xs mt-1">
                        {errors[`section_${index}_body`]}
                      </p>
                    )}
                  </div>
                )}

                {/* Rich Text Editor for other sections */}
                {index > 0 && (
                  <div>
                    <label className="block text-xs font-medium mb-1">
                      Content (Rich Text) *
                    </label>
                    <ReactQuill
                      theme="snow"
                      value={sec.body_html}
                      onChange={(value) =>
                        handleChangeSection(index, 'body_html', value)
                      }
                      modules={quillModules}
                      formats={quillFormats}
                      className="bg-white"
                    />
                    <p className="text-[11px] text-gray-500 mt-1">
                      You can use titles, bold, lists, colors, etc.
                    </p>
                    {errors[`section_${index}_body`] && (
                      <p className="text-red-500 text-xs mt-1">
                        {errors[`section_${index}_body`]}
                      </p>
                    )}
                  </div>
                )}

                {/* Image section - Only show for non-intro sections */}
                {index > 0 && (
                  <div>
                    <label className="block text-xs font-medium mb-1">
                      Section image
                    </label>
                    <div className="flex items-center gap-4">
                      <input
                        type="file"
                        accept="image/*"
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (file) uploadImage(file, 'section', index);
                        }}
                      />
                      {sec.image_url && (
                        <img
                          src={sec.image_url}
                          className="w-20 h-16 object-cover rounded-md border"
                          alt={sec.image_alt || 'Section image'}
                        />
                      )}
                    </div>
                    <div className="mt-2">
                      <label className="block text-xs font-medium mb-1">
                        Section image alt
                      </label>
                      <input
                        className="w-full border rounded-md px-2 py-1 text-sm"
                        value={sec.image_alt}
                        onChange={(e) =>
                          handleChangeSection(index, 'image_alt', e.target.value)
                        }
                        placeholder="Deep cleaning of the kitchen in Airbnb with focus on high-contact surfaces"
                      />
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Save button */}
        <div className="flex justify-end">
          <button
            disabled={saving}
            onClick={handleSave}
            className="px-6 py-2 rounded-lg bg-[#031634] text-white text-sm font-montserrat disabled:opacity-60"
          >
            {saving ? 'Saving...' : 'Save post'}
          </button>
        </div>
      </div>
    </div>
  );
}