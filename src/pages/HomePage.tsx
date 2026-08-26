import HeroSection from '../sections/HomePage/HeroSection';
import ServicesSection from '../sections/HomePage/ServicesSection';
import InsuranceSection from '../sections/HomePage/InsuranceSection';
import GeneralServicesSection from '../sections/HomePage/GeneralServices';
import SpecializedServicesSection from '../sections/HomePage/SpecializedServices';
import FormSection from '../sections/HomePage/FormSection';
import TestimonialsSection from '../sections/HomePage/TestimonialsSection';
import WhyChooseUsSection from '../sections/HomePage/WhyChooseUsSection';
import BlogSection from '../sections/HomePage/BlogSection';
import Footer from '../components/layout/Footer';

export default function HomePage() {
  return (
    <div className="min-h-screen">
      <HeroSection />
      <ServicesSection />
      <InsuranceSection />
      <GeneralServicesSection />
      <SpecializedServicesSection />
      <FormSection />
      <TestimonialsSection />
      <WhyChooseUsSection />
      <BlogSection />
      <Footer />
    </div>
  );
}