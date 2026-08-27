import { useState, useEffect, useRef } from 'react';
import { ChevronLeft, ChevronRight, ArrowRight } from 'lucide-react';
import { Helmet } from 'react-helmet-async';
import { API_BASE_URL } from '../../api/client';

type BlogPost = {
  id: number;
  slug: string;
  title: string;
  excerpt: string;
  image: string;
  author: string;
  date: string;
  category: string;
};

const formatPostDate = (iso: string) => {
  if (!iso) return '';
  const d = new Date(iso);
  return d.toLocaleDateString('en-CA', { year: 'numeric', month: 'short', day: 'numeric' });
};

export default function BlogSection() {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [viewport, setViewport] = useState<'mobile' | 'tablet' | 'desktop'>('desktop');
  const [blogPosts, setBlogPosts] = useState<BlogPost[]>([]);
  const [loading, setLoading] = useState(true);
  const trackRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const classify = () => {
      const w = window.innerWidth;
      if (w < 768) setViewport('mobile');
      else if (w < 1024) setViewport('tablet');
      else setViewport('desktop');
    };
    classify();
    window.addEventListener('resize', classify);
    return () => window.removeEventListener('resize', classify);
  }, []);

  useEffect(() => {
    const loadPosts = async () => {
      try {
        const res = await fetch(`${API_BASE_URL}/api/blogs`);
        if (!res.ok) throw new Error('Error fetching blogs');
        const json = await res.json();
        const posts = Array.isArray(json) ? json : Array.isArray(json.posts) ? json.posts : [];
        setBlogPosts(posts.slice(0, 4));
      } catch (err) {
        console.error(err);
        setBlogPosts([]);
      } finally {
        setLoading(false);
      }
    };
    loadPosts();
  }, []);

  const nextSlide = () => { if (currentIndex < blogPosts.length - 1) setCurrentIndex((p) => p + 1); };
  const prevSlide = () => { if (currentIndex > 0) setCurrentIndex((p) => p - 1); };
  const handleReadMore = (slug: string) => { window.location.href = `/blog/${slug}`; };
  const handleViewAllBlogs = () => { window.location.href = '/blog'; };

  if (loading || blogPosts.length === 0) return null;

  /* ── card width (desktop only) ─────────────────────────────────────────── */
  const DESKTOP_CARD_W = 554;
  const CARD_GAP = 32;

  /*
    translateX fix:
    - Each step moves exactly one card width + gap.
    - No extra centering offset — the active card always starts flush left
      so there's no risk of negative paddingLeft at intermediate widths.
    - Cards not active are dimmed with opacity 0.5.
  */
  const desktopTranslateX = -(currentIndex * (DESKTOP_CARD_W + CARD_GAP));

  return (
    <>
      <Helmet>
        <title>Cleaning Services Victoria BC | Demo Cleaning Co.</title>
        <meta name="description" content="Expert tips, company updates, and home care insights from Demo Cleaning Co. Learn professional cleaning techniques and home maintenance advice." />
        <meta name="keywords" content="cleaning tips, home care, cleaning blog, house cleaning advice, professional cleaning" />
        <link rel="canonical" href="https://demo-cleaning-frontend.onrender.com/blog" />
        <meta property="og:title" content="The Clean Living Blog | Demo Cleaning Co. Canada" />
        <meta property="og:description" content="Expert tips, company updates, and home care insights from Demo Cleaning Co." />
        <meta property="og:type" content="website" />
        <meta property="og:url" content="https://demo-cleaning-frontend.onrender.com/blog" />
      </Helmet>

      <section className="w-full py-16 mt-[-40px] md:mt-[-20px] lg:mt-0 md:py-24 bg-white">
        <div className="max-w-7xl mx-auto px-4 md:px-8 lg:px-4">

          {/* Header */}
          <div className="text-center mb-12 md:mb-16">
            <h2
              style={{
                fontFamily: 'Montserrat, sans-serif',
                fontWeight: viewport === 'mobile' ? 600 : 700,
                fontSize: 'clamp(18.43px, 4vw, 40px)',
                lineHeight: '100%',
                color: '#031634',
                marginBottom: viewport === 'mobile' ? '8px' : '12px',
              }}
            >
              The Clean Living Blog
            </h2>
            <p
              style={{
                fontFamily: 'Quicksand, sans-serif',
                fontWeight: 500,
                fontSize: 'clamp(14px, 2vw, 18px)',
                lineHeight: viewport === 'mobile' ? '100%' : '30px',
                color: viewport === 'mobile' ? '#1E1E1E' : '#000000',
              }}
            >
              Expert Tips, Company Updates & Home Care Insights
            </p>
          </div>

          {/* ── Desktop carousel ≥1024px ──────────────────────────────────────── */}
          {viewport === 'desktop' && (
            <div className="relative overflow-hidden">
              {/*
                Track: plain translateX — one step = card width + gap.
                No dynamic paddingLeft that could go negative on smaller desktops.
              */}
              <div
                ref={trackRef}
                className="flex items-start transition-transform duration-500"
                style={{
                  transform: `translateX(${desktopTranslateX}px)`,
                  gap: `${CARD_GAP}px`,
                }}
              >
                {blogPosts.map((post, index) => (
                  <article
                    key={post.id}
                    style={{
                      width: `${DESKTOP_CARD_W}px`,
                      flexShrink: 0,
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '24px',
                      // Active card is fully opaque; others are dimmed
                      opacity: index === currentIndex ? 1 : 0.5,
                      transition: 'opacity 0.5s',
                    }}
                  >
                    <img
                      src={post.image}
                      alt={post.title}
                      style={{
                        width: `${DESKTOP_CARD_W}px`,
                        height: '312px',
                        borderRadius: '6px',
                        objectFit: 'cover',
                      }}
                    />
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                      <span style={{ width: 'fit-content', padding: '4px 12px', borderRadius: '36px', background: '#031634', boxShadow: '0px 1px 2px rgba(105,81,255,0.05)', fontFamily: 'Montserrat, sans-serif', fontWeight: 500, fontSize: '12px', lineHeight: '18px', color: '#FFFFFF', textAlign: 'center' }}>
                        {post.category}
                      </span>
                      <p style={{ fontFamily: 'Montserrat, sans-serif', fontWeight: 500, fontSize: '16px', lineHeight: '24px', color: '#777777' }}>
                        {post.author} • {formatPostDate(post.date)}
                      </p>
                      <h3 style={{ fontFamily: 'Montserrat, sans-serif', fontWeight: 700, fontSize: '24px', lineHeight: '32px', color: '#031634' }}>
                        {post.title}
                      </h3>
                      <p style={{ fontFamily: 'Quicksand, sans-serif', fontWeight: 400, fontSize: '16px', lineHeight: '24px', color: '#000000' }}>
                        {post.excerpt}
                      </p>
                      <button
                        onClick={() => handleReadMore(post.slug)}
                        style={{ width: 'fit-content', padding: '12px 24px', borderRadius: '24px', border: '2px solid #031634', background: '#FFFFFF', display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontFamily: 'Montserrat, sans-serif', fontWeight: 600, fontSize: '18px', lineHeight: '28px', color: '#031634', transition: 'all 0.3s' }}
                        onMouseEnter={(e) => { e.currentTarget.style.background = '#031634'; e.currentTarget.style.color = '#FFFFFF'; }}
                        onMouseLeave={(e) => { e.currentTarget.style.background = '#FFFFFF'; e.currentTarget.style.color = '#031634'; }}
                      >
                        Read Post <ArrowRight style={{ width: '16px', height: '16px' }} />
                      </button>
                    </div>
                  </article>
                ))}
              </div>

              {/* Navigation */}
              <div className="flex items-center justify-center gap-4 mt-12">
                {[
                  { fn: prevSlide, dis: currentIndex === 0, icon: ChevronLeft, label: 'Previous' },
                  { fn: nextSlide, dis: currentIndex >= blogPosts.length - 1, icon: ChevronRight, label: 'Next' },
                ].map(({ fn, dis, icon: Icon, label }) => (
                  <button
                    key={label}
                    onClick={fn}
                    disabled={dis}
                    className="flex items-center justify-center rounded-full transition-all disabled:opacity-30 disabled:cursor-not-allowed hover:bg-gray-50"
                    style={{ width: '40px', height: '40px', border: '1.5px solid #031634', background: '#FFFFFF' }}
                    aria-label={`${label} blog posts`}
                  >
                    <Icon style={{ width: '20px', height: '20px', color: '#031634' }} />
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* ── Tablet grid 768–1023px ────────────────────────────────────────── */}
          {viewport === 'tablet' && (
            <div className="grid grid-cols-2 gap-6">
              {blogPosts.slice(0, 4).map((post) => (
                <article key={post.id} className="flex flex-col gap-4">
                  <img
                    src={post.image}
                    alt={post.title}
                    className="w-full object-cover rounded-md"
                    style={{ height: 'clamp(160px, 22vw, 260px)' }}
                  />
                  <div className="flex flex-col gap-3">
                    <span style={{ width: 'fit-content', padding: '3px 10px', borderRadius: '36px', background: '#031634', fontFamily: 'Montserrat, sans-serif', fontWeight: 500, fontSize: '11px', lineHeight: '18px', color: '#FFFFFF' }}>
                      {post.category}
                    </span>
                    <p style={{ fontFamily: 'Montserrat, sans-serif', fontWeight: 500, fontSize: 'clamp(12px, 1.4vw, 15px)', lineHeight: '1.5', color: '#777777' }}>
                      {post.author} • {formatPostDate(post.date)}
                    </p>
                    <h3 style={{ fontFamily: 'Montserrat, sans-serif', fontWeight: 700, fontSize: 'clamp(14px, 1.8vw, 20px)', lineHeight: '1.3', color: '#031634' }}>
                      {post.title}
                    </h3>
                    <p className="line-clamp-3" style={{ fontFamily: 'Quicksand, sans-serif', fontWeight: 400, fontSize: 'clamp(12px, 1.4vw, 15px)', lineHeight: '1.5', color: '#000000' }}>
                      {post.excerpt}
                    </p>
                    <button
                      onClick={() => handleReadMore(post.slug)}
                      style={{ width: 'fit-content', padding: '10px 20px', borderRadius: '20px', border: '1.5px solid #031634', background: '#FFFFFF', display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', fontFamily: 'Montserrat, sans-serif', fontWeight: 600, fontSize: 'clamp(13px, 1.4vw, 16px)', lineHeight: '1.4', color: '#031634', transition: 'all 0.3s' }}
                      onMouseEnter={(e) => { e.currentTarget.style.background = '#031634'; e.currentTarget.style.color = '#FFFFFF'; }}
                      onMouseLeave={(e) => { e.currentTarget.style.background = '#FFFFFF'; e.currentTarget.style.color = '#031634'; }}
                    >
                      Read Post <ArrowRight style={{ width: '14px', height: '14px' }} />
                    </button>
                  </div>
                </article>
              ))}
            </div>
          )}

          {/* ── Mobile vertical list <768px ──────────────────────────────────── */}
          {viewport === 'mobile' && (
            <div className="flex flex-col gap-8">
              {blogPosts.slice(0, 3).map((post) => (
                <article key={post.id} style={{ display: 'flex', flexDirection: 'column', gap: '16.91px' }}>
                  <img src={post.image} alt={post.title} style={{ width: '100%', height: '219.84px', borderRadius: '4.23px', objectFit: 'cover' }} />
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                    <span style={{ width: 'fit-content', padding: '2.82px 8.46px', borderRadius: '25.37px', background: '#031634', boxShadow: '0px 0.7px 1.41px rgba(105,81,255,0.05)', fontFamily: 'Quicksand, sans-serif', fontWeight: 500, fontSize: '9.86px', lineHeight: '100%', color: '#FFFFFF', textAlign: 'center' }}>
                      {post.category}
                    </span>
                    <p style={{ fontFamily: 'Quicksand, sans-serif', fontWeight: 400, fontSize: '11.27px', lineHeight: '100%', color: '#777777' }}>
                      {post.author} • {post.date}
                    </p>
                    <h3 style={{ fontFamily: 'Montserrat, sans-serif', fontWeight: 600, fontSize: '14.09px', lineHeight: '100%', color: '#031634' }}>
                      {post.title}
                    </h3>
                    <p style={{ fontFamily: 'Quicksand, sans-serif', fontWeight: 400, fontSize: '11.27px', lineHeight: '100%', color: '#000000' }}>
                      {post.excerpt}
                    </p>
                    <button
                      onClick={() => handleReadMore(post.slug)}
                      style={{ width: 'fit-content', padding: '8.46px 16.91px', borderRadius: '16.91px', border: '0.7px solid #031634', background: '#FFFFFF', display: 'flex', alignItems: 'center', gap: '5.64px', cursor: 'pointer', fontFamily: 'Montserrat, sans-serif', fontWeight: 600, fontSize: '11.27px', lineHeight: '100%', color: '#031634' }}
                    >
                      Read Post <ArrowRight style={{ width: '12px', height: '12px' }} />
                    </button>
                  </div>
                </article>
              ))}
            </div>
          )}

          {/* View All Blogs */}
          <div className="flex justify-center mt-12">
            <button
              onClick={handleViewAllBlogs}
              style={{
                padding: viewport === 'mobile' ? '10px 20px' : viewport === 'tablet' ? '12px 26px' : '14px 32px',
                borderRadius: '24px',
                border: '2px solid #031634',
                background: '#031634',
                cursor: 'pointer',
                fontFamily: 'Montserrat, sans-serif',
                fontWeight: 600,
                fontSize: viewport === 'mobile' ? '14px' : viewport === 'tablet' ? '16px' : '18px',
                lineHeight: '28px',
                color: '#FFFFFF',
                transition: 'all 0.3s',
              }}
              onMouseEnter={(e) => { e.currentTarget.style.background = '#FFFFFF'; e.currentTarget.style.color = '#031634'; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = '#031634'; e.currentTarget.style.color = '#FFFFFF'; }}
            >
              View All Blog Posts
            </button>
          </div>

        </div>
      </section>
    </>
  );
}