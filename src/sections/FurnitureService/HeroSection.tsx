import Navbar from '../../components/layout/Navbar';
import rightIcon from '../../assets/rightIcon.png';
import PlaceholderImage from '../../components/PlaceholderImage';

export default function HeroSection() {
    const handleBookNow = () => {
        // Comportamiento para el botón Book Now
        const el = document.getElementById('contact');
        if (el) el.scrollIntoView({ behavior: 'smooth' });
      };
      
    return (
        <section className="relative w-full">
            <PlaceholderImage className="w-full h-[350px] md:h-[800px] object-cover"
            />
    
      <div className="fixed top-0 left-0 right-0 z-[100]">
        <Navbar variant="transparent" />
      </div>

      <div className="absolute inset-0 pt-[60px]">
            
            {/* Contenido del Hero - Desktop */}
            <div className="hidden md:flex flex-col items-start pl-8 lg:pl-16 xl:pl-24 pt-[49px] lg:ml-[100px] lg:mt-[100px]">
              {/* Título Principal */}
              <h1 className="text-[48px] font-montserrat font-bold leading-[100%] text-[#031634] mb-[50px] max-w-[592px]">
              Furniture Cleaning              
              </h1>
              
              {/* Subtítulo */}
              <p className="text-[24px] font-quicksand font-medium leading-[100%] text-[#1E1E1E] mb-[35px] max-w-[510px]">
              Professional upholstery care that revives and refreshes your furniture. We remove stains, dust, and odors while preserving fabrics with safe, eco-friendly methods             
              </p>
              
              {/* Botón Book Now */}
              <button
                onClick={handleBookNow}
                className="flex items-center gap-2 w-[165px] h-[44px] px-6 py-3 bg-white border border-[#031634] rounded-[24px] hover:bg-gray-50 transition-colors duration-200"
              >
                <span className="text-[16px] font-montserrat font-semibold leading-[100%] text-[#031634]">
                  Book Now
                </span>
                <img src={rightIcon} alt="Right Icon" className="w-[18px] h-[17px] text-[#031634]" />
              </button>
            </div>
    
            {/* Contenido del Hero - Mobile */}
            <div className="md:hidden flex flex-col items-center text-center px-4 pt-1">
              {/* Título Principal */}
              <h1 className="w-[191px] text-[16px] font-montserrat font-semibold leading-[100%] text-[#031634] mb-3 mt-5">
              Furniture Cleaning
              </h1>
              
              {/* Subtítulo */}
              <p className="w-[180px] text-[10px] font-quicksand font-medium leading-[100%] text-[#1E1E1E] mb-6">
              Professional upholstery care that revives and refreshes your furniture. We remove stains, dust, and odors while preserving fabrics with safe, eco-friendly methods             
              </p>
              {/* Prueba para Discord de pequeño commit */}
              {/* Botón Book Now */}
              <button
                onClick={handleBookNow}
                className="flex items-center gap-[2.66px] w-[100px] h-[22px] px-2 py-1 bg-white border border-[#031634] rounded-[8px] hover:bg-gray-50 transition-colors duration-200"
              >
                <span className="text-[10px] font-montserrat font-semibold leading-[100%] text-[#031634]">
                  Book Now
                </span>
                <img src={rightIcon} alt="Right Icon" className="w-[8px] h-[8px] ml-2 text-[#031634]" />
              </button>
            </div>
          </div>
        </section>
      );
    }