import HeroSection from '../sections/Blogs/HeroSection';
import Footer from '../components/layout/Footer';
import BlogsSection from '../sections/Blogs/BlogsSection';
import AffordableSection from '../sections/Blogs/AffordableSection';
import FormSection from '../sections/HomePage/FormSection';

export default function BlogPage() {
  return (
    <div className="min-h-screen">
      <HeroSection />
      <BlogsSection />
      <AffordableSection />
      <FormSection />
      <Footer />
    </div>
  );
}