import { useState } from 'react';
import PlaceholderImage from '../PlaceholderImage';
import instagramIcon from '../../assets/instagram.png';
import facebookIcon from '../../assets/facebook.png';
import whatsappIcon from '../../assets/whatsappFooter.png';
import mIcon from '../../assets/m.png';
import iconoInput from '../../assets/iconoInput.png';

// Placeholder ficticio (rango NANP reservado 555-01XX) — el real era de
// Monkey Cleaning. LAB, ago 2026.
const WHATSAPP_URL = 'https://wa.me/16045550142';

export default function Footer() {
  const year = new Date().getFullYear();
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();

    if (!email) {
      setMessage('Please enter your email');
      return;
    }

    setLoading(true);
    setMessage('');

    try {
      const response = await fetch(`${import.meta.env.VITE_API_URL}/api/leads`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          email: email,
          fullName: 'Newsletter Subscriber',
          source: 'newsletter',
          description: 'Newsletter subscription'
        }),
      });

      const data = await response.json();

      if (response.ok) {
        setMessage('✅ Thank you for subscribing!');
        setEmail('');
      } else {
        setMessage('❌ ' + (data.error || 'Subscription failed'));
      }
    } catch (error) {
      setMessage('❌ Network error. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <footer className="bg-[#031634] text-white">
      {/* ============================================================
          DESKTOP (≥1024px)
          Unchanged from original — px-[200px] layout preserved.
      ============================================================ */}
      <div className="hidden lg:block">
        <div className="w-full px-[200px] py-[55px]">
          <div className="flex justify-between gap-16">
            {/* Columna izquierda */}
            <div>
              <div className="mb-[49px]">
                <span className="font-['Montserrat'] font-bold text-white text-2xl">Demo Cleaning Co.</span>
              </div>

              <p className="font-['Montserrat'] font-medium text-[18px] leading-[25px] mb-[49px] max-w-[452px]">
                A Team of Full-service Reliable Cleaning Professionals
              </p>

              <nav className="flex items-center gap-[18px] mb-[35px]">
                <a
                  href="/contact-us"
                  className="font-['Quicksand'] font-medium text-[18px] leading-[100%] text-[#A6A6A6] hover:text-white transition-colors"
                >
                  Contact us
                </a>
                <span className="font-['Quicksand'] font-medium text-[18px] leading-[100%] text-[#A6A6A6]">
                  Victoria, BC
                </span>
              </nav>

              <div className="flex items-center gap-[16px] mb-[31px]">
                <p className="font-['Montserrat'] font-medium text-[18px] leading-[100%]">
                  Follow Us
                </p>
                <div className="flex gap-[20px]">
                  <a href={WHATSAPP_URL} target="_blank" rel="noopener noreferrer" className="w-[28px] h-[28px] hover:opacity-80">
                    <img src={whatsappIcon} alt="Whatsapp" className="w-[28px] h-[28px]" />
                  </a>
                  <a href="mailto:joaquin.labtinos@gmail.com" className="w-[28px] h-[28px] hover:opacity-80">
                    <img src={mIcon} alt="Mail" className="w-[28px] h-[28px]" />
                  </a>
                  <a href="#" className="w-[28px] h-[28px] hover:opacity-80">
                    <img src={instagramIcon} alt="Instagram" className="w-[28px] h-[28px]" />
                  </a>
                  <a href="#" className="w-[28px] h-[28px] hover:opacity-80">
                    <img src={facebookIcon} alt="Facebook" className="w-[28px] h-[28px]" />
                  </a>
                </div>
              </div>
            </div>

            {/* Columna derecha: newsletter */}
            <div className="flex flex-col items-start mt-[50px]">
              <p className="font-['Montserrat'] font-bold text-[18px] leading-[50px] mb-[10px]">
                Subscribe Newsletter
              </p>
              <p className="font-['Quicksand'] font-normal text-[18px] leading-[100%] mb-[40px] max-w-[360px]">
                Fresh cleaning tips delivered to your inbox
              </p>

              <label className="block font-['Montserrat'] font-medium text-[14px] leading-[100%] mb-[20px]">
                Email<span className="text-[#FF0000]">*</span>
              </label>

              <form onSubmit={handleSubmit} className="relative w-[320px]">
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  disabled={loading}
                  className="w-full h-[48px] rounded-[14px] pl-[16px] pr-[56px] text-slate-900 text-[14px] font-['Quicksand'] border border-[#D9DBE9] shadow-[0px_0.5px_1px_0px_rgba(25,33,61,0.04)]"
                  placeholder="Enter your email"
                />
                <button
                  type="submit"
                  disabled={loading}
                  className="absolute top-[4px] bottom-[4px] right-[4px] w-[40px] rounded-[20px] bg-white flex items-center justify-center text-[#031634] text-[20px] font-bold disabled:opacity-50"
                >
                  {loading ? '...' : <img src={iconoInput} alt="Icono Input" />}
                </button>
              </form>
              {message && (
                <p className={`mt-2 text-sm ${message.includes('✅') ? 'text-green-400' : 'text-red-400'}`}>
                  {message}
                </p>
              )}
            </div>
          </div>

          <div className="mt-[40px] flex items-center justify-between">
            <p className="font-['Montserrat'] font-medium text-[18px] leading-[30px] max-w-[608px]">
              Copyright © {year} Demo Cleaning Co. | Powered by Demo Cleaning Co.
            </p>
            <div className="flex gap-[8px] font-['Montserrat'] font-medium text-[18px] leading-[30px]">
              <a href="/privacy" className="hover:underline">
                Privacy Policy
              </a>
              <span className="text-[#A6A6A6]">·</span>
              <a href="/admin/login" className="text-[#A6A6A6] opacity-40 hover:opacity-70 transition-opacity text-[12px] self-end mb-[2px]">
                Admin
              </a>
            </div>
          </div>
        </div>
      </div>

      {/* ============================================================
          TABLET (768px–1023px) — NEW intermediate layout
          Two-column flex but with fluid percentage padding instead
          of the fixed px-[200px] that crushes content on tablets.
      ============================================================ */}
      <div className="hidden md:block lg:hidden">
        <div className="w-full px-[5%] py-[48px]">
          <div className="flex justify-between gap-8">
            {/* Columna izquierda */}
            <div className="flex-1 min-w-0">
              <div className="mb-[36px]">
                <span className="font-['Montserrat'] font-bold text-white text-lg">Demo Cleaning Co.</span>
              </div>

              <p className="font-['Montserrat'] font-medium text-[15px] leading-[22px] mb-[36px]">
                A Team of Full-service Reliable Cleaning Professionals
              </p>

              <nav className="flex flex-wrap items-center gap-x-[14px] gap-y-[8px] mb-[28px]">
                <a
                  href="/contact-us"
                  className="font-['Quicksand'] font-medium text-[15px] text-[#A6A6A6] hover:text-white transition-colors"
                >
                  Contact us
                </a>
                <span className="font-['Quicksand'] font-medium text-[15px] text-[#A6A6A6]">
                  Victoria, BC
                </span>
              </nav>

              <div className="flex items-center gap-[12px]">
                <p className="font-['Montserrat'] font-medium text-[15px]">
                  Follow Us
                </p>
                <div className="flex gap-[16px]">
                  <a href={WHATSAPP_URL} target="_blank" rel="noopener noreferrer" className="w-[24px] h-[24px] hover:opacity-80">
                    <img src={whatsappIcon} alt="Whatsapp" className="w-[24px] h-[24px]" />
                  </a>
                  <a href="mailto:joaquin.labtinos@gmail.com" className="w-[24px] h-[24px] hover:opacity-80">
                    <img src={mIcon} alt="Mail" className="w-[24px] h-[24px]" />
                  </a>
                  <a href="#" className="w-[24px] h-[24px] hover:opacity-80">
                    <img src={instagramIcon} alt="Instagram" className="w-[24px] h-[24px]" />
                  </a>
                  <a href="#" className="w-[24px] h-[24px] hover:opacity-80">
                    <img src={facebookIcon} alt="Facebook" className="w-[24px] h-[24px]" />
                  </a>
                </div>
              </div>
            </div>

            {/* Columna derecha: newsletter — shrinks gracefully */}
            <div className="flex flex-col items-start flex-shrink-0 w-[260px]">
              <p className="font-['Montserrat'] font-bold text-[16px] leading-[44px] mb-[8px]">
                Subscribe Newsletter
              </p>
              <p className="font-['Quicksand'] font-normal text-[14px] leading-[1.4] mb-[28px]">
                Fresh cleaning tips delivered to your inbox
              </p>

              <label className="block font-['Montserrat'] font-medium text-[13px] mb-[16px]">
                Email<span className="text-[#FF0000]">*</span>
              </label>

              <form onSubmit={handleSubmit} className="relative w-full">
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  disabled={loading}
                  className="w-full h-[44px] rounded-[14px] pl-[14px] pr-[52px] text-slate-900 text-[13px] font-['Quicksand'] border border-[#D9DBE9]"
                  placeholder="Enter your email"
                />
                <button
                  type="submit"
                  disabled={loading}
                  className="absolute top-[4px] bottom-[4px] right-[4px] w-[36px] rounded-[20px] bg-white flex items-center justify-center disabled:opacity-50"
                >
                  {loading ? '...' : <img src={iconoInput} alt="Icono Input" className="w-[16px] h-[16px]" />}
                </button>
              </form>
              {message && (
                <p className={`mt-2 text-xs ${message.includes('✅') ? 'text-green-400' : 'text-red-400'}`}>
                  {message}
                </p>
              )}
            </div>
          </div>

          <div className="mt-[36px] flex flex-wrap items-center justify-between gap-y-2">
            <p className="font-['Montserrat'] font-medium text-[14px] leading-[28px]">
              Copyright © {year} Demo Cleaning Co. | Powered by Demo Cleaning Co.
            </p>
            <div className="flex gap-[8px] font-['Montserrat'] font-medium text-[14px] leading-[28px] items-center">
              <a href="/privacy" className="hover:underline">
                Privacy Policy
              </a>
              <span className="text-[#A6A6A6]">·</span>
              <a href="/admin/login" className="text-[#A6A6A6] opacity-40 hover:opacity-70 transition-opacity text-[11px]">
                Admin
              </a>
            </div>
          </div>
        </div>
      </div>

      {/* ============================================================
          MOBILE (<768px)
          Unchanged from original.
      ============================================================ */}
      <div className="md:hidden px-[27.65px] py-[40px]">
        <div className="mb-[30px]">
          <PlaceholderImage
            className="w-[93.26px] h-[39.54px]"
          />
        </div>

        <p className="font-['Quicksand'] font-medium text-[16.13px] leading-[100%] mb-[60px]">
          A Team of Full-service Reliable Cleaning Professionals
        </p>

        <div className="-mx-[27.65px] bg-[rgba(255,255,255,0.04)] p-[27.65px] shadow-[0px_4.61px_4.61px_0px_rgba(0,0,0,0.25)] mb-[27.65px]">
          <p className="font-['Montserrat'] font-bold text-[20.74px] leading-[57.6px] mb-[10px] text-center">
            Subscribe Newsletter
          </p>
          <p className="font-['Quicksand'] font-medium text-[16.13px] leading-[100%] mb-[30px] text-center">
            Fresh cleaning tips delivered to your inbox
          </p>

          <label className="block font-['Montserrat'] font-medium text-[16.13px] leading-[100%] mb-[25px]">
            Email<span className="text-[#FF0000]">*</span>
          </label>

          <form onSubmit={handleSubmit} className="relative">
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              disabled={loading}
              className="w-full h-[55.3px] rounded-[16.13px] pl-[18.43px] pr-[60px] text-slate-900 border-[1.15px] font-['Quicksand'] font-normal text-[16.13px] border-[#D9DBE9] shadow-[0px_0.58px_1.15px_0px_rgba(25,33,61,0.04)]"
              placeholder="Enter your email"
            />
            <button
              type="submit"
              disabled={loading}
              className="absolute top-[4px] bottom-[4px] right-[4px] w-[40px] rounded-[18px] bg-white flex items-center justify-center text-[#031634] text-[20px] font-bold disabled:opacity-50"
            >
              {loading ? '...' : <img src={iconoInput} alt="Icono Input" className="w-[20px] h-[20px]" />}
            </button>
          </form>
          {message && (
            <p className={`mt-2 text-sm text-center ${message.includes('✅') ? 'text-green-400' : 'text-red-400'}`}>
              {message}
            </p>
          )}
        </div>

        <nav className="flex flex-col gap-[11.52px] mb-[50px] font-['Quicksand'] font-medium text-[20.74px] leading-[100%] mt-[60px] space-y-[20px]">
          <a href="/contact-us" className="hover:underline">Contact us</a>
          <span>Victoria, BC</span>
        </nav>

        <div className="mb-[50px]">
          <p className="font-['Montserrat'] font-medium text-[20.74px] leading-[100%] mb-[30px]">
            Follow Us
          </p>
          <div className="flex gap-[25px]">
            <a href={WHATSAPP_URL} target="_blank" rel="noopener noreferrer" className="w-[32.26px] h-[32.26px] hover:opacity-80">
              <img src={whatsappIcon} alt="Whatsapp" className="w-[32.26px] h-[32.26px]" />
            </a>
            <a href="mailto:joaquin.labtinos@gmail.com" className="w-[32.26px] h-[32.26px] hover:opacity-80">
              <img src={mIcon} alt="Mail" className="w-[32.26px] h-[32.26px]" />
            </a>
            <a href="#" className="w-[32.26px] h-[32.26px] hover:opacity-80">
              <img src={instagramIcon} alt="Instagram" className="w-[32.26px] h-[32.26px]" />
            </a>
            <a href="#" className="w-[32.26px] h-[32.26px] hover:opacity-80">
              <img src={facebookIcon} alt="Facebook" className="w-[32.26px] h-[32.26px]" />
            </a>
          </div>
        </div>

        <hr className="border-t-[1.15px] border-white mb-[50px] opacity-100" />

        <div className="flex gap-[9.22px] font-['Montserrat'] font-medium text-[16.13px] leading-[34.56px] mb-[8px] items-center">
          <a href="/privacy" className="hover:underline">Privacy Policy</a>
          <span className="text-[#A6A6A6]">·</span>
          <a href="/admin/login" className="text-[#A6A6A6] opacity-40 hover:opacity-70 transition-opacity text-[12px]">
            Admin
          </a>
        </div>

        <p className="font-['Montserrat'] font-medium text-[16.13px] leading-[34.56px]">
          Copyright © {year} Demo Cleaning Co. | Powered by Demo Cleaning Co.
        </p>
      </div>
    </footer>
  );
}