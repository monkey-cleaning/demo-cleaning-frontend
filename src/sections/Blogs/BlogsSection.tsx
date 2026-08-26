import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import UpIcon from "../../assets/upIcon.png";
import rightArrowBlogs from "../../assets/arrow-right-blogs.png";
import { api } from "../../api/client";

type BlogPost = {
  id: number;
  slug: string;
  title: string;
  excerpt: string;
  tag: string;
  author: string;
  date: string;
  image: string;
  imageAlt?: string | null;
};

export default function BlogsSection() {
  const [posts, setPosts] = useState<BlogPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showAllArticles, setShowAllArticles] = useState(false);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();

  useEffect(() => {
    const load = async () => {
      try {
        const data = await api<BlogPost[]>("/api/blogs");
        setPosts(data);
      } catch (e: any) {
        console.error(e);
        setError(e.message ?? "Error loading blog posts");
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  const handleNextClick = () => {
    if (!scrollContainerRef.current) return;
    scrollContainerRef.current.scrollBy({ left: 400, behavior: "smooth" });
  };

  const handleViewAllArticles = () => {
    setShowAllArticles(true);
    requestAnimationFrame(() => {
      scrollContainerRef.current?.scrollTo({ left: 0, behavior: "smooth" });
    });
  };

  const handleReadMoreClick = (slug: string) => {
    navigate(`/blog/${slug}`);
  };

  const mobilePosts = showAllArticles ? posts : posts.slice(0, 3);

  // Shared card content renderer — avoids duplicating JSX between carousel and grid
  const CardContent = ({ post }: { post: BlogPost }) => (
    <>
      <div className="
        mt-5 h-[28px]
        px-[12px] py-[4px]
        rounded-[36px]
        bg-[#031634]
        shadow-[0px_1px_2px_0px_#6951FF0D]
        flex items-center justify-center
        w-[220px] md:w-[260px] lg:w-[300px]
      ">
        <span className="font-quicksand font-medium text-[12px] md:text-[13px] lg:text-[14px] leading-[100%] text-white text-center">
          {post.tag}
        </span>
      </div>

      <p className="mt-4 font-quicksand font-normal text-[14px] lg:text-[16px] leading-[100%] text-[#777777]">
        {post.author} •{" "}
        {new Date(post.date).toLocaleDateString(undefined, {
          year: "numeric",
          month: "short",
          day: "numeric",
        })}
      </p>

      <h3 className="mt-4 font-montserrat font-semibold text-[16px] lg:text-[20px] leading-[100%] text-[#031634]">
        {post.title}
      </h3>

      <p className="mt-4 font-quicksand font-medium text-[12px] lg:text-[14px] leading-[140%] text-[#031634] line-clamp-3">
        {post.excerpt}
      </p>

      <button
        onClick={() => handleReadMoreClick(post.slug)}
        className="
          mt-5
          w-[145px] lg:w-[167px] h-[38px] lg:h-[44px]
          px-[20px] lg:px-[24px] py-[10px] lg:py-[12px]
          border border-[#031634]
          rounded-[24px]
          bg-white
          flex items-center justify-center gap-2
          transition-colors cursor-pointer
        "
      >
        <span className="font-montserrat font-semibold text-[14px] lg:text-[16px] leading-[100%] text-[#031634]">
          Read More
        </span>
        <img src={UpIcon} alt="" loading="lazy" className="w-[10px] h-[10px] lg:w-[12px] lg:h-[10px]" />
      </button>
    </>
  );

  return (
    <section className="w-full bg-white">
      <div className="mx-auto lg:max-w-[1200px] mt-[80px] mb-[80px] px-4 md:px-8 lg:px-0">

        {/* ======= TOP ======= */}
        <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-6 md:gap-4 lg:gap-6">
          <div className="flex flex-col items-center md:items-start md:flex-1 md:min-w-0">
            <h2 className="
              mt-[-20px] md:mt-[40px] lg:mt-[50px]
              font-montserrat font-bold text-[#031634]
              leading-[100%]
              text-[23.28px] md:text-[36px] lg:text-[42px] xl:text-[48px]
              w-[290px] md:w-auto
              text-center md:text-left
            ">
              Sparkle & Shine: The Monkey Cleaning Guide{" "}
            </h2>
          </div>

          <div className="flex flex-col items-center md:items-start md:flex-1 md:min-w-0 md:max-w-[44%] lg:max-w-[40%] md:mt-[40px] lg:mt-[50px]">
            <p className="
              mt-1 md:mt-3
              font-quicksand font-medium text-[#666666]
              leading-[130%]
              text-[11.64px] md:text-[17px] lg:text-[20px] xl:text-[24px]
              w-[251px] md:w-full
              text-center md:text-left
            ">
              Discover practical cleaning tips, eco-friendly advice, and expert
              insights to help you keep your spaces healthy, fresh, and
              beautifully maintained
            </p>
          </div>
        </div>

        <div className="border-b border-[#CDB380] my-8 md:my-12 w-full" />

        {/* ======= STATES ======= */}
        {loading && (
          <div className="w-full py-10 text-center text-gray-500">Loading articles...</div>
        )}
        {error && !loading && (
          <div className="w-full py-10 text-center text-red-500">{error}</div>
        )}
        {!loading && !error && posts.length === 0 && (
          <div className="w-full py-10 text-center text-gray-500">No articles yet.</div>
        )}

        {/* ======= CONTENT ======= */}
        {!loading && !error && posts.length > 0 && (
          <div className="w-full">

            {/* ===== DESKTOP ===== */}
            <div className="relative hidden md:block">
              {!showAllArticles ? (
                // Carrusel — cards con ancho fijo está OK aquí porque el scroll
                // horizontal es intencional; solo ajustamos tamaños intermedios
                <>
                  <div
                    ref={scrollContainerRef}
                    className="flex overflow-x-auto overflow-y-hidden gap-4 lg:gap-6 xl:gap-8 [&::-webkit-scrollbar]:hidden"
                    style={{ scrollBehavior: "smooth", scrollbarWidth: "none", msOverflowStyle: "none" }}
                  >
                    {posts.map((post) => (
                      <article
                        key={post.id}
                        className="flex flex-col items-start flex-shrink-0 w-[300px] lg:w-[340px] xl:w-[370px]"
                      >
                        <img
                          src={post.image}
                          alt={post.imageAlt || post.title}
                          className="w-full h-[212px] lg:h-[240px] xl:h-[262px] rounded-[20px] lg:rounded-[26px] xl:rounded-[30px] object-cover"
                          loading="lazy"
                        />
                        <CardContent post={post} />
                      </article>
                    ))}
                  </div>

                  {/* Flecha */}
                  {posts.length > 3 && (
                    <button
                      type="button"
                      onClick={handleNextClick}
                      className="
                        absolute right-7 top-[110px]
                        translate-x-1/2
                        w-[44px] h-[44px]
                        flex items-center justify-center
                        hover:scale-110 transition-transform cursor-pointer
                      "
                      aria-label="Next blogs"
                    >
                      <img src={rightArrowBlogs} alt="next" loading="lazy" className="w-[44px] h-[44px]" />
                    </button>
                  )}
                </>
              ) : (
                // View All — grilla fluida (misma estrategia que ServicesSection)
                <div className="grid grid-cols-3 gap-4 lg:gap-6 xl:gap-8">
                  {posts.map((post) => (
                    <article
                      key={post.id}
                      className="flex flex-col items-start w-full"
                    >
                      <img
                        src={post.image}
                        alt={post.imageAlt || post.title}
                        className="w-full h-[212px] lg:h-[240px] xl:h-[262px] rounded-[20px] lg:rounded-[26px] xl:rounded-[30px] object-cover"
                        loading="lazy"
                      />
                      <CardContent post={post} />
                    </article>
                  ))}
                </div>
              )}
            </div>

            {/* ===== MOBILE — sin cambios ===== */}
            <div className="md:hidden flex flex-col items-center gap-8">
              {mobilePosts.map((post) => (
                <article
                  key={post.id}
                  className="flex flex-col items-start w-[282.43px] space-y-3"
                >
                  <img
                    src={post.image}
                    alt={post.imageAlt || post.title}
                    className="w-[282.433px] h-[199.993px] rounded-[22.9px] object-cover"
                    loading="lazy"
                  />

                  <div className="mt-3 w-[160px] h-[21.373px] px-[9.16px] py-[3.05px] rounded-[27.48px] bg-[#031634] shadow-[0px_0.76px_1.53px_0px_#6951FF0D] flex items-center justify-center">
                    <span className="font-quicksand font-medium text-[10.69px] leading-[100%] text-white text-center">
                      {post.tag}
                    </span>
                  </div>

                  <p className="mt-2 font-quicksand font-normal text-[12.21px] leading-[100%] text-[#777777]">
                    {post.author} •{" "}
                    {new Date(post.date).toLocaleDateString(undefined, {
                      year: "numeric",
                      month: "short",
                      day: "numeric",
                    })}
                  </p>

                  <h3 className="mt-2 font-montserrat font-semibold text-[15.27px] leading-[100%] text-[#031634]">
                    {post.title}
                  </h3>

                  <p className="mt-2 font-quicksand font-medium text-[10.69px] leading-[140%] text-[#031634] line-clamp-3">
                    {post.excerpt}
                  </p>

                  <button
                    onClick={() => handleReadMoreClick(post.slug)}
                    className="mt-3 w-[127.54px] h-[33.587px] px-[18.32px] py-[9.16px] border-[0.76px] border-[#031634] rounded-[18.32px] bg-white flex items-center justify-center gap-[6.11px] hover:bg-[#031634] hover:text-white transition-colors cursor-pointer"
                  >
                    <span className="font-montserrat font-semibold text-[12.21px] leading-[100%] text-[#031634]">
                      Read More
                    </span>
                    <img src={UpIcon} alt="up icon" loading="lazy" className="w-[9px] h-[9px]" />
                  </button>
                </article>
              ))}

              {!showAllArticles && posts.length > 3 && (
                <button
                  onClick={handleViewAllArticles}
                  className="mt-2 w-[200px] h-[44px] px-[24px] py-[12px] rounded-[24px] bg-[#031634] border border-[#031634] flex items-center justify-center gap-2 hover:bg-[#022a4e] transition-colors cursor-pointer"
                >
                  <span className="font-montserrat font-semibold text-[16px] leading-[100%] text-white">
                    View All Articles
                  </span>
                </button>
              )}
            </div>

            {/* View All Articles (desktop) */}
            {!showAllArticles && posts.length > 3 && (
              <div className="hidden md:flex justify-center mt-10">
                <button
                  onClick={handleViewAllArticles}
                  className="w-[182px] h-[44px] px-[24px] py-[12px] rounded-[24px] bg-[#031634] border border-[#031634] flex items-center justify-center gap-2 hover:bg-[#022a4e] transition-colors cursor-pointer"
                >
                  <span className="font-montserrat font-semibold text-[16px] leading-[100%] text-white">
                    View All Articles
                  </span>
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </section>
  );
}