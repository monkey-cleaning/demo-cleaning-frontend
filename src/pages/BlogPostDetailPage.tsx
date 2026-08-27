import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { Helmet } from "react-helmet-async";
import { API_BASE_URL } from "../api/client";
import Navbar from "../components/layout/Navbar";
import Footer from "../components/layout/Footer";
import facebookIcon from "../assets/facebook-icon.png";
import twitterIcon from "../assets/twitter-icon.png";
import instagramIcon from "../assets/instagram-icon.png";
import lineIcon from "../assets/line-blog.png";
import timeIcon from "../assets/time-blog.png";
import statsIcon from "../assets/stats-blog.png";

type BlogPost = {
  id: number;
  slug: string;
  title: string;
  excerpt: string;
  image: string;
  imageAlt?: string | null;
  tag: string;
  author: string;
  date: string;
  seoTitle?: string | null;
  seoDescription?: string | null;
};

type BlogSection = {
  id: number;
  order: number;
  heading: string;
  body: string | null;
  body_html: string | null;
  image_url: string | null;
  image_alt: string | null;
};

type BlogDetailResponse = {
  post: BlogPost;
  sections: BlogSection[];
  related: BlogPost[];
};

export default function BlogPostDetailPage() {
  const { slug } = useParams<{ slug: string }>();
  const [data, setData] = useState<BlogDetailResponse | null>(null);
  const [loading, setLoading] = useState(true);

  const [email, setEmail] = useState("");
  const [agree, setAgree] = useState(false);
  const [subLoading, setSubLoading] = useState(false);
  const [subMessage, setSubMessage] = useState<string | null>(null);

  useEffect(() => {
    const load = async () => {
      try {
        const res = await fetch(`${API_BASE_URL}/api/blogs/${slug}`);
        if (!res.ok) throw new Error("Post not found");
        const json = (await res.json()) as BlogDetailResponse;
        setData(json);
      } catch (e) {
        console.error(e);
        setData(null);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [slug]);

  const handleSubscribe = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!email) { setSubMessage("Please enter your email"); return; }
    if (!agree) { setSubMessage("Please confirm you agree to the terms before subscribing."); return; }
    setSubLoading(true);
    setSubMessage(null);
    try {
      const response = await fetch(`${API_BASE_URL}/api/leads`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email,
          fullName: "Newsletter Subscriber",
          source: "newsletter",
          description: "Newsletter subscription",
        }),
      });
      const data = await response.json();
      if (response.ok) {
        setSubMessage("✅ Thank you for subscribing!");
        setEmail("");
        setAgree(false);
      } else {
        setSubMessage("❌ " + (data.error || "Subscription failed"));
      }
    } catch {
      setSubMessage("❌ Network error. Please try again.");
    } finally {
      setSubLoading(false);
    }
  };

  const handleShareFacebook = () => {
    const url = window.location.href;
    const text = data?.post.title || "";
    window.open(`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}&quote=${encodeURIComponent(text)}`, "_blank", "width=600,height=400");
  };

  const handleShareTwitter = () => {
    const url = window.location.href;
    const text = data?.post.title || "";
    window.open(`https://twitter.com/intent/tweet?url=${encodeURIComponent(url)}&text=${encodeURIComponent(text)}`, "_blank", "width=600,height=400");
  };

  const handleShareInstagram = () => {
    navigator.clipboard.writeText(window.location.href).then(() => {
      alert("Link copied to clipboard! You can now paste it on Instagram.");
    });
  };

  const handleShare = (platform: "facebook" | "twitter" | "instagram") => {
    if (platform === "facebook") handleShareFacebook();
    else if (platform === "twitter") handleShareTwitter();
    else handleShareInstagram();
  };

  if (loading) return <div className="w-full py-20 text-center text-gray-500">Loading post...</div>;
  if (!data) return <div className="w-full py-20 text-center text-red-500">Post not found</div>;

  const { post, sections, related } = data;
  const introText = sections.length > 0 && sections[0].body ? sections[0].body : post.excerpt;

  const pageTitle = (post.seoTitle || post.title) + " | Demo Cleaning Co.";
  const pageDescription = post.seoDescription || post.excerpt.slice(0, 155);
  const baseOrigin = typeof window !== "undefined" ? window.location.origin : "https://demo-cleaning-frontend.onrender.com";
  const url = `${baseOrigin}/blog/${post.slug}`;
  const ogImage = post.image;
  const ogImageAlt = post.imageAlt || post.title;

  return (
    <div className="w-full bg-white">
      <Helmet>
        <title>{pageTitle}</title>
        <meta name="description" content={pageDescription} />
        <link rel="canonical" href={url} />
        <meta property="og:type" content="article" />
        <meta property="og:title" content={post.seoTitle || post.title} />
        <meta property="og:description" content={pageDescription} />
        <meta property="og:url" content={url} />
        {ogImage && (<><meta property="og:image" content={ogImage} /><meta property="og:image:alt" content={ogImageAlt} /></>)}
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:title" content={post.seoTitle || post.title} />
        <meta name="twitter:description" content={pageDescription} />
        {ogImage && <meta name="twitter:image" content={ogImage} />}
        <script type="application/ld+json">
          {JSON.stringify({
            "@context": "https://schema.org",
            "@type": "Article",
            headline: post.seoTitle || post.title,
            description: pageDescription,
            image: ogImage ? [ogImage] : undefined,
            author: { "@type": "Organization", name: post.author || "Demo Cleaning Co." },
            datePublished: post.date,
            mainEntityOfPage: { "@type": "WebPage", "@id": url },
          })}
        </script>
      </Helmet>

      {/* ── HERO ── */}
      <section
        className="w-full relative"
        style={{
          backgroundImage: `url(${post.image})`,
          backgroundSize: "cover",
          backgroundPosition: "center",
          backgroundColor: "#D9D9D9BF",
        }}
      >
        <div className="absolute top-0 left-0 w-full z-[50]">
          <Navbar variant="transparent" />
        </div>
        <div className="absolute inset-0 bg-white/70 md:bg-white/65 z-[1]" />

        {/* Hero content — altura fluida en tablet */}
        <div className="relative z-[2] max-w-[1200px] mx-auto px-4 md:px-8 lg:px-4 flex items-center h-[320px] md:h-[500px] lg:h-[590px] xl:h-[684px]">
          <div className="w-full text-center md:text-left md:mt-[40px] lg:mt-[100px] xl:mt-[150px]">
            <div className="md:max-w-[500px] lg:max-w-[580px] xl:max-w-[650px] mx-auto md:mx-0">
              {/* Tag pill */}
              <div className="
                inline-flex items-center justify-center
                rounded-[27.48px] md:rounded-[36px]
                bg-[#031634]
                shadow-[0px_0.76px_1.53px_0px_#6951FF0D] md:shadow-[0px_1px_2px_0px_#6951FF0D]
                px-[9.16px] py-[3.05px] md:px-[12px] md:py-[4px]
                mb-3 md:mb-6
              ">
                <span className="font-quicksand font-medium text-[10.69px] md:text-[14px] leading-[100%] text-white text-center">
                  {post.tag}
                </span>
              </div>

              {/* Title */}
              <h1 className="
                font-montserrat font-semibold md:font-bold leading-[100%] text-[#031634]
                text-[16px] md:text-[34px] lg:text-[42px] xl:text-[48px]
                max-w-[280px] md:max-w-full
                mx-auto md:mx-0
              ">
                {post.title}
              </h1>

              {/* Excerpt */}
              <p className="
                mt-4
                font-quicksand font-medium leading-[140%] text-[#031634]
                text-[10px] md:text-[17px] lg:text-[20px] xl:text-[24px]
                max-w-[300px] md:max-w-full
                mx-auto md:mx-0
              ">
                {post.excerpt}
              </p>
            </div>

            {/* Meta info */}
            <div className="
              mt-4 md:mt-6
              flex flex-wrap md:flex-nowrap items-center justify-center md:justify-start
              gap-x-4 gap-y-1
              font-montserrat font-normal
              text-[7.52px] md:text-[14px] lg:text-[16px]
              leading-[18.8px] md:leading-[40px]
              text-[#031634]
            ">
              <span className="whitespace-nowrap">by {post.author}</span>
              <img src={lineIcon} alt="" loading="lazy" className="hidden md:inline-block w-[24px] h-[1px]" />

              <div className="flex items-center gap-1 whitespace-nowrap">
                <img src={timeIcon} alt="Read time" loading="lazy" className="w-[10px] h-[10px] md:w-[14px] md:h-[14px]" />
                <span>2 minute read</span>
              </div>
              <img src={lineIcon} alt="" loading="lazy" className="hidden md:inline-block w-[24px] h-[1px]" />

              <div className="flex items-center gap-1 whitespace-nowrap">
                <img src={statsIcon} alt="Views" loading="lazy" className="w-[10px] h-[10px] md:w-[12px] md:h-[12px]" />
                <span>1.6K views</span>
              </div>
              <img src={lineIcon} alt="" loading="lazy" className="hidden md:inline-block w-[24px] h-[1px]" />

              <div className="flex items-center gap-2 whitespace-nowrap">
                <div className="flex items-center gap-2">
                  <button onClick={() => handleShare("facebook")} className="hover:opacity-80 transition-opacity" aria-label="Share on Facebook">
                    <img src={facebookIcon} alt="Share on Facebook" loading="lazy" className="w-[10px] h-[10px] md:w-[16px] md:h-[16px]" />
                  </button>
                  <button onClick={() => handleShare("twitter")} className="hover:opacity-80 transition-opacity" aria-label="Share on Twitter">
                    <img src={twitterIcon} alt="Share on Twitter" loading="lazy" className="w-[10px] h-[10px] md:w-[16px] md:h-[16px]" />
                  </button>
                  <button onClick={() => handleShare("instagram")} className="hover:opacity-80 transition-opacity" aria-label="Share on Instagram">
                    <img src={instagramIcon} alt="Share on Instagram" loading="lazy" className="w-[10px] h-[10px] md:w-[16px] md:h-[16px]" />
                  </button>
                </div>
                <span>1.2K shares</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── INTRO + SIDEBAR ── */}
      <section className="max-w-[1200px] mx-auto px-4 md:px-8 lg:px-4 pt-10 pb-10">
        {/* grid: texto principal | sidebar — gap fluido en tablet */}
        <div className="grid grid-cols-1 md:grid-cols-[minmax(0,2.2fr)_minmax(0,1.1fr)] gap-6 lg:gap-8 xl:gap-10">

          {/* Intro text */}
          <div className="md:mt-[60px] lg:mt-[100px] xl:mt-[150px]">
            <p className="
              font-quicksand font-medium text-[#666666]
              text-[15px] md:text-[18px] lg:text-[21px] xl:text-[24px]
              leading-[22px] md:leading-[26px] lg:leading-[28px] xl:leading-[30px]
            ">
              {introText}
            </p>
          </div>

          {/* Sidebar SOLO desktop */}
          <aside className="hidden md:flex flex-col gap-6">
            {/* Follow Us */}
            <div className="flex flex-col gap-4">
              <div className="inline-flex items-center px-4 py-3 rounded-[12px]">
                <span className="font-montserrat font-bold text-[17px] lg:text-[20px] text-[#031634] leading-[100%]">
                  Follow Us
                </span>
              </div>
              <div className="flex items-center gap-4 lg:gap-6">
                {[
                  { platform: "facebook" as const, icon: facebookIcon, label: "Share on Facebook", count: "10" },
                  { platform: "twitter" as const, icon: twitterIcon, label: "Share on Twitter", count: "69K" },
                  { platform: "instagram" as const, icon: instagramIcon, label: "Share on Instagram", count: "45" },
                ].map(({ platform, icon, label, count }) => (
                  <div key={platform} className="flex flex-col items-center gap-2">
                    <button
                      onClick={() => handleShare(platform)}
                      className="w-[22px] h-[22px] lg:w-[28px] lg:h-[28px] flex items-center justify-center hover:opacity-80 transition-opacity"
                      aria-label={label}
                    >
                      <img src={icon} alt={label} loading="lazy" className="w-full h-full" />
                    </button>
                    <span className="text-xs font-quicksand text-[#031634]">{count}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Subscription box */}
            <div className="flex flex-col gap-4 mt-4">
              <p className="font-montserrat text-[16px] lg:text-[20px] leading-[24px] lg:leading-[30px] text-[#031634]">
                <span className="font-bold">Subscription:</span>{" "}
                <span className="font-medium">Subscribe to our newsletter and receive a selection of cool articles every weeks</span>
              </p>

              <form onSubmit={handleSubscribe} className="flex flex-col gap-3">
                {/* Input — w-full para que no desborde en tablet */}
                <input
                  type="email"
                  placeholder="Enter your email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="
                    w-full
                    h-[52px] lg:h-[70px]
                    px-5 lg:px-6
                    rounded-[14px]
                    border border-[#CECECE]
                    font-montserrat text-[14px] lg:text-[18px] font-medium
                    placeholder:text-[#757575]
                    focus:outline-none focus:ring-2 focus:ring-[#031634]/40
                  "
                />
                <div className="flex justify-center mt-2">
                  <button
                    type="submit"
                    disabled={subLoading}
                    className="w-[110px] lg:w-[119px] h-[40px] lg:h-[44px] px-5 lg:px-6 py-3 rounded-[24px] border border-[#031634] bg-[#031634] flex items-center justify-center disabled:opacity-60 disabled:cursor-not-allowed"
                  >
                    <span className="font-montserrat font-semibold text-[14px] lg:text-[16px] leading-[100%] text-white">
                      {subLoading ? "Sending..." : "Subscribe"}
                    </span>
                  </button>
                </div>

                <label className="flex items-start gap-3 mt-1">
                  <input
                    type="checkbox"
                    checked={agree}
                    onChange={(e) => setAgree(e.target.checked)}
                    className="mt-[16px] lg:mt-[20px] w-5 lg:w-6 h-5 lg:h-6 rounded border border-[#A9A9A9]"
                  />
                  <span className="font-quicksand text-[13px] lg:text-[16px] leading-[100%] text-[#A9A9A9]">
                    By checking this box, you confirm that you have read and are agreeing to our terms of use regarding the storage of the data submitted through this form.
                  </span>
                </label>
                {subMessage && <p className="text-sm mt-1 font-quicksand text-[#031634]">{subMessage}</p>}
              </form>
            </div>
          </aside>

          {/* Follow Us + Subscription MOBILE — sin cambios */}
          <div className="md:hidden flex flex-col items-center text-center gap-4">
            <p className="font-montserrat font-bold text-[10px] leading-[100%] text-[#031634]">Follow Us</p>
            <div className="flex items-center justify-center gap-8">
              {[
                { platform: "facebook" as const, icon: facebookIcon, label: "Share on Facebook", count: "10" },
                { platform: "twitter" as const, icon: twitterIcon, label: "Share on Twitter", count: "69K" },
                { platform: "instagram" as const, icon: instagramIcon, label: "Share on Instagram", count: "45" },
              ].map(({ platform, icon, label, count }) => (
                <div key={platform} className="flex flex-col items-center gap-1">
                  <button onClick={() => handleShare(platform)} className="hover:opacity-80 transition-opacity" aria-label={label}>
                    <img src={icon} alt={label} loading="lazy" className="w-[12.4px] h-[12.4px]" />
                  </button>
                  <span className="font-quicksand text-[7.08px] text-[#031634]">{count}</span>
                </div>
              ))}
            </div>

            <div className="w-[160px] h-[40.29px]">
              <p className="font-montserrat text-[8.85px] leading-[13.28px] text-[#031634] max-w-[260px]">
                <span className="font-bold">Subscription:</span>{" "}
                <span className="font-medium">Subscribe to our newsletter and receive a selection of cool articles every weeks</span>
              </p>
            </div>

            <form onSubmit={handleSubscribe} className="flex flex-col items-center gap-3">
              <input
                type="email"
                placeholder="Enter your email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-[148.32px] h-[30.99px] px-[10.63px] py-[8.41px] rounded-[14px] border-[0.44px] border-[#CECECE] font-montserrat text-[7.97px] font-medium placeholder:text-[#757575] focus:outline-none focus:ring-2 focus:ring-[#031634]/40"
              />
              <button
                type="submit"
                disabled={subLoading}
                className="w-[60px] h-[20px] px-[10.63px] py-[5.31px] rounded-[10.63px] border-[0.44px] border-[#031634] bg-[#031634] flex items-center justify-center disabled:opacity-60 disabled:cursor-not-allowed"
              >
                <span className="font-montserrat font-semibold text-[7.97px] leading-[100%] text-white">
                  {subLoading ? "Sending..." : "Subscribe"}
                </span>
              </button>
              <div className="w-[160px]">
                <label className="flex items-start gap-2 mt-1 max-w-[260px]">
                  <input
                    type="checkbox"
                    checked={agree}
                    onChange={(e) => setAgree(e.target.checked)}
                    className="mt-[10px] w-[10.63px] h-[10.63px] rounded border border-[#A9A9A9]"
                  />
                  <span className="font-quicksand text-[7.08px] leading-[100%] text-[#A9A9A9]">
                    By checking this box, you confirm that you have read and are agreeing to our terms of use regarding the storage of the data submitted through this form.
                  </span>
                </label>
                {subMessage && <p className="text-[7.5px] mt-1 font-quicksand text-[#031634]">{subMessage}</p>}
              </div>
            </form>
          </div>
        </div>
      </section>

      {/* ── SEPARADOR ── */}
      <div className="hidden md:flex justify-center">
        <div className="w-full max-w-[1170px] border-t border-[#CDB380]" />
      </div>
      <div className="md:hidden flex justify-center">
        <div className="w-[325.56px] border-t-[0.48px] border-[#CDB380]" />
      </div>

      {/* ── CONTENT SECTIONS ── */}
      <section className="max-w-[1200px] mx-auto px-4 md:px-8 lg:px-4 py-12 space-y-12 lg:space-y-16">
        {sections.map((sec, index) => (
          <div
            key={sec.id}
            className="grid grid-cols-1 md:grid-cols-2 gap-6 lg:gap-10 items-center"
          >
            <div>
              {sec.heading && (
                <h2 className="mb-4 font-montserrat text-[18px] md:text-[20px] lg:text-2xl text-[#031634] font-semibold">
                  {sec.heading}
                </h2>
              )}
              {sec.body_html ? (
                <div
                  className="font-quicksand text-[#333] text-[14px] md:text-[15px] lg:text-[16px] leading-relaxed space-y-3"
                  dangerouslySetInnerHTML={{ __html: sec.body_html }}
                />
              ) : index === 0 ? null : (
                <p className="font-quicksand text-[#333] text-[14px] md:text-[15px] lg:text-[16px] leading-relaxed">
                  {sec.body}
                </p>
              )}
            </div>
            {sec.image_url && (
              <div className="w-full">
                <img
                  src={sec.image_url}
                  alt={sec.image_alt || sec.heading}
                  className="w-full max-h-[280px] md:max-h-[320px] lg:max-h-[350px] object-cover rounded-2xl shadow-md"
                  loading="lazy"
                />
              </div>
            )}
          </div>
        ))}
      </section>

      {/* ── SEPARADOR ANTES DE RELATED ── */}
      <div className="hidden md:flex justify-center mt-10 mb-10">
        <div className="w-full max-w-[1170px] border-t border-[#CDB380]" />
      </div>
      <div className="md:hidden flex justify-center">
        <div className="w-[325.56px] border-t-[0.48px] border-[#CDB380]" />
      </div>

      {/* ── RELATED ARTICLES ── */}
      {related.length > 0 && (
        <section className="py-12">
          <div className="max-w-[1200px] mx-auto px-4 md:px-8 lg:px-4">
            <h3 className="text-[20px] md:text-2xl lg:text-3xl font-montserrat font-semibold text-[#031634] mb-8">
              Related Articles
            </h3>
            {/* sm:grid-cols-2 evita que 3 columnas se apilen mal en 768–900px */}
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4 lg:gap-6 xl:gap-8">
              {related.map((r) => (
                <Link
                  to={`/blog/${r.slug}`}
                  key={r.id}
                  className="block bg-white p-4 rounded-xl shadow-sm hover:shadow-lg transition-shadow"
                >
                  <img
                    src={r.image}
                    className="w-full h-[160px] md:h-[170px] lg:h-[180px] object-cover rounded-lg"
                    alt={r.imageAlt || r.title}
                    loading="lazy"
                  />
                  <p className="mt-3 text-xs text-gray-500 font-quicksand">
                    By {r.author} •{" "}
                    {new Date(r.date).toLocaleDateString(undefined, {
                      year: "numeric",
                      month: "short",
                      day: "numeric",
                    })}
                  </p>
                  <h4 className="font-montserrat text-[14px] md:text-[15px] lg:text-[16px] font-semibold mt-1 text-[#031634]">
                    {r.title}
                  </h4>
                  <p className="text-gray-700 text-sm mt-2 font-quicksand line-clamp-3">
                    {r.excerpt}
                  </p>
                </Link>
              ))}
            </div>
          </div>
        </section>
      )}

      <Footer />
    </div>
  );
}