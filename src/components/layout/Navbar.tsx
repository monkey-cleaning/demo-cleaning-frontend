import { useState } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import logoDesktop from '../../assets/logo-desktop.png';
import logoMobile from '../../assets/logo-desktop.png';
import arrowDown from '../../assets/arrow-down.png';
import { useNavigate } from 'react-router-dom';

interface NavbarProps {
  variant?: 'default' | 'transparent';
  onGetProposalClick?: () => void;
}

const desktopLinkClasses = ({ isActive }: { isActive: boolean }) =>
  [
    'text-navy font-montserrat text-[18px] leading-[1] transition-colors duration-200',
    isActive ? 'font-bold' : 'font-medium hover:text-navy/80',
  ].join(' ');

// Tablet link classes — slightly smaller text so links fit in the pill
const tabletLinkClasses = ({ isActive }: { isActive: boolean }) =>
  [
    'text-navy font-montserrat text-[15px] leading-[1] transition-colors duration-200',
    isActive ? 'font-bold' : 'font-medium hover:text-navy/80',
  ].join(' ');

const mobileLinkClasses = ({ isActive }: { isActive: boolean }) =>
  [
    'block font-montserrat text-[16px] text-navy transition-colors duration-200',
    isActive ? 'font-bold' : 'font-medium hover:text-navy/80',
  ].join(' ');

export default function Navbar({ variant = 'default' }: NavbarProps) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [desktopDropdown, setDesktopDropdown] = useState<string | null>(null);
  const location = useLocation();
  const navigate = useNavigate();

  const navigation = {
    home: { path: '/', label: 'Home' },
    general: {
      path: '/services/general',
      label: 'General Services',
      subpages: [
        { path: '/services/general/residential', label: 'Residential' },
        { path: '/services/general/commercial', label: 'Commercial' },
        { path: '/services/general/offices', label: 'Offices' }
      ]
    },
    specialized: {
      path: '/services/specialized',
      label: 'Specialized Services',
      subpages: [
        //{ path: '/services/specialized/furniture', label: 'Furniture Cleaning' },
        { path: '/services/specialized/carpet', label: 'Carpet Cleaning' },
        { path: '/services/specialized/tile', label: 'Tile Cleaning' }
      ]
    },
    blog: { path: '/blog', label: 'Blog' }
  };

  // Background tokens — unchanged logic, just reused across desktop & tablet
  const navPillBackground = variant === 'transparent'
    ? 'bg-[#FFFFFF7D] backdrop-blur-md'
    : 'bg-white shadow-sm';

  const mobileNavBackground = variant === 'transparent'
    ? 'bg-white/90 backdrop-blur-md'
    : 'bg-white';

  const ctaClasses = variant === 'transparent'
    ? 'bg-[#FFFFFF7D] text-navy hover:bg-white/90'
    : 'bg-navy text-white hover:bg-navy/90';

  const isActivePath = (path: string) =>
    location.pathname === path || location.pathname.startsWith(path + '/');

  // ─── Shared dropdown render helpers ───────────────────────────────────────

  const GeneralDropdown = () => (
    desktopDropdown === 'general' ? (
      <>
        <div className="absolute top-full left-0 w-48 h-8 -mt-0" />
        <div className="absolute top-full left-0 mt-8 w-48 bg-[#FFFFFF1A] rounded-lg shadow-lg py-2 z-50 border border-[#0000001A]">
          {navigation.general.subpages.map((subpage) => (
            <NavLink
              key={subpage.path}
              to={subpage.path}
              className={({ isActive }) =>
                `block px-4 py-2 text-sm font-montserrat transition-colors ${isActive ? 'text-navy font-bold bg-gray-50' : 'text-gray-700 hover:bg-gray-50'
                }`
              }
            >
              {subpage.label}
            </NavLink>
          ))}
        </div>
      </>
    ) : null
  );

  const SpecializedDropdown = () => (
    desktopDropdown === 'specialized' ? (
      <>
        <div className="absolute top-full left-0 w-56 h-8 -mt-0" />
        <div className="absolute top-full left-0 mt-8 w-56 bg-[#FFFFFF1A] rounded-lg shadow-lg py-2 z-50 border border-[#0000001A]">
          {navigation.specialized.subpages.map((subpage) => (
            <NavLink
              key={subpage.path}
              to={subpage.path}
              className={({ isActive }) =>
                `block px-4 py-2 text-sm font-montserrat transition-colors ${isActive ? 'text-navy font-bold bg-gray-50' : 'text-gray-700 hover:bg-gray-50'
                }`
              }
            >
              {subpage.label}
            </NavLink>
          ))}
        </div>
      </>
    ) : null
  );

  return (
    <>
      {/* ============================================================
          DESKTOP (≥1024px) — Unchanged from original
      ============================================================ */}
      <div className={`${variant === 'transparent' ? 'pt-10' : 'py-4'} hidden lg:flex items-center justify-between max-w-6xl mx-auto px-1`}>
        <NavLink to="/" end>
          <img src={logoDesktop} alt="Demo Cleaning Co." className="w-[142px] h-[60px]" />
        </NavLink>

        <nav className={`flex items-center gap-10 rounded-[24px] px-[18px] py-[20px] relative ${navPillBackground}`}>
          <NavLink to={navigation.home.path} end className={desktopLinkClasses}>
            {navigation.home.label}
          </NavLink>

          <div
            className="relative"
            onMouseEnter={() => setDesktopDropdown('general')}
            onMouseLeave={() => setDesktopDropdown(null)}
          >
            <NavLink
              to={navigation.general.path}
              className={({ isActive }) =>
                [desktopLinkClasses({ isActive: isActive || isActivePath(navigation.general.path) }), "inline-flex items-center gap-1"].join(" ")
              }
            >
              {navigation.general.label} <img src={arrowDown} alt="Arrow Down" className="w-[10px] h-[10px] ml-1" />
            </NavLink>
            <GeneralDropdown />
          </div>

          <div
            className="relative"
            onMouseEnter={() => setDesktopDropdown('specialized')}
            onMouseLeave={() => setDesktopDropdown(null)}
          >
            <NavLink
              to={navigation.specialized.path}
              className={({ isActive }) =>
                [desktopLinkClasses({ isActive: isActive || isActivePath(navigation.specialized.path) }), "inline-flex items-center gap-1"].join(" ")
              }
            >
              {navigation.specialized.label} <img src={arrowDown} alt="Arrow Down" className="w-[10px] h-[10px] ml-1" />
            </NavLink>
            <SpecializedDropdown />
          </div>

          <NavLink to={navigation.blog.path} className={desktopLinkClasses}>
            {navigation.blog.label}
          </NavLink>
        </nav>

        <button
          className={`inline-flex items-center justify-center rounded-[24px] px-[18px] py-[20px] font-montserrat font-medium text-[16px] leading-[1] transition-colors duration-200 ${ctaClasses}`}
          onClick={() => navigate('/contact-us')}
        >
          Contact Us
        </button>
      </div>

      {/* ============================================================
          TABLET (768px–1023px) — NEW intermediate layout
          Same structural pill as desktop but:
          • Smaller gap + font size so all links fit without overflow
          • Fluid max-width with percentage padding
          • Logo scales down
          • CTA button uses compact px/py
      ============================================================ */}
      <div className={`${variant === 'transparent' ? 'pt-8' : 'py-3'} hidden md:flex lg:hidden items-center justify-between w-full px-[4%]`}>
        <NavLink to="/" end>
          <img src={logoDesktop} alt="Demo Cleaning Co." className="w-[110px] h-auto" />
        </NavLink>

        <nav className={`flex items-center gap-5 rounded-[20px] px-[14px] py-[14px] relative ${navPillBackground}`}>
          <NavLink to={navigation.home.path} end className={tabletLinkClasses}>
            {navigation.home.label}
          </NavLink>

          {/* General Services */}
          <div
            className="relative"
            onMouseEnter={() => setDesktopDropdown('general')}
            onMouseLeave={() => setDesktopDropdown(null)}
          >
            <NavLink
              to={navigation.general.path}
              className={({ isActive }) =>
                [tabletLinkClasses({ isActive: isActive || isActivePath(navigation.general.path) }), "inline-flex items-center gap-1"].join(" ")
              }
            >
              General <img src={arrowDown} alt="" className="w-[8px] h-[8px] ml-1" />
            </NavLink>
            <GeneralDropdown />
          </div>

          {/* Specialized Services */}
          <div
            className="relative"
            onMouseEnter={() => setDesktopDropdown('specialized')}
            onMouseLeave={() => setDesktopDropdown(null)}
          >
            <NavLink
              to={navigation.specialized.path}
              className={({ isActive }) =>
                [tabletLinkClasses({ isActive: isActive || isActivePath(navigation.specialized.path) }), "inline-flex items-center gap-1"].join(" ")
              }
            >
              Specialized <img src={arrowDown} alt="" className="w-[8px] h-[8px] ml-1" />
            </NavLink>
            <SpecializedDropdown />
          </div>

          <NavLink to={navigation.blog.path} className={tabletLinkClasses}>
            {navigation.blog.label}
          </NavLink>
        </nav>

        <button
          className={`inline-flex items-center justify-center rounded-[20px] px-[14px] py-[14px] font-montserrat font-medium text-[14px] leading-[1] transition-colors duration-200 whitespace-nowrap ${ctaClasses}`}
          onClick={() => navigate('/contact-us')}
        >
          Contact Us
        </button>
      </div>

      {/* ============================================================
          MOBILE (<768px) — Unchanged from original
      ============================================================ */}
      <div className={`md:hidden max-w-[432px] mx-auto px-4 ${variant === 'transparent' ? 'pt-6' : 'py-4'}`}>
        <div className="flex items-center justify-between">
          <div className='ml-5'>
            <NavLink to="/" end>
              <img src={logoMobile} alt="Demo Cleaning Co." className="w-[60px] h-[25px]" />
            </NavLink>
          </div>
          <div className='mr-5'>
            <button
              type="button"
              onClick={() => setMobileOpen((prev) => !prev)}
              className="w-6 h-6 flex items-center justify-center relative"
              aria-label="Open main menu"
            >
              <span className={`absolute w-full h-[2px] bg-navy rounded-full transition-all duration-200 ${mobileOpen ? "rotate-45 top-3" : "top-1"}`} />
              <span className={`absolute w-full h-[2px] bg-navy rounded-full transition-all duration-200 ${mobileOpen ? "opacity-0" : "top-3"}`} />
              <span className={`absolute w-full h-[2px] bg-navy rounded-full transition-all duration-200 ${mobileOpen ? "-rotate-45 top-3" : "top-5"}`} />
            </button>
          </div>
        </div>

        {mobileOpen && (
          <nav className={`mt-4 rounded-2xl px-4 py-3 space-y-2 ${mobileNavBackground} shadow-lg relative z-[110]`}>
            <NavLink to={navigation.home.path} end className={mobileLinkClasses} onClick={() => setMobileOpen(false)}>
              {navigation.home.label}
            </NavLink>

            <div className="space-y-1 ml-4 border-l-2 border-gray-200 pl-3">
              <NavLink
                to={navigation.general.path}
                className={({ isActive }) => mobileLinkClasses({ isActive: isActive || isActivePath(navigation.general.path) })}
                onClick={() => setMobileOpen(false)}
              >
                <span className="font-semibold">{navigation.general.label}</span>
              </NavLink>
              {navigation.general.subpages.map((subpage) => (
                <NavLink
                  key={subpage.path}
                  to={subpage.path}
                  className={({ isActive }) =>
                    `block font-montserrat text-[14px] pl-2 transition-colors ${isActive ? 'text-navy font-bold' : 'text-gray-600 hover:text-navy'}`
                  }
                  onClick={() => setMobileOpen(false)}
                >
                  • {subpage.label}
                </NavLink>
              ))}
            </div>

            <div className="space-y-1 ml-4 border-l-2 border-gray-200 pl-3">
              <NavLink
                to={navigation.specialized.path}
                className={({ isActive }) => mobileLinkClasses({ isActive: isActive || isActivePath(navigation.specialized.path) })}
                onClick={() => setMobileOpen(false)}
              >
                <span className="font-semibold">{navigation.specialized.label}</span>
              </NavLink>
              {navigation.specialized.subpages.map((subpage) => (
                <NavLink
                  key={subpage.path}
                  to={subpage.path}
                  className={({ isActive }) =>
                    `block font-montserrat text-[14px] pl-2 transition-colors ${isActive ? 'text-navy font-bold' : 'text-gray-600 hover:text-navy'}`
                  }
                  onClick={() => setMobileOpen(false)}
                >
                  • {subpage.label}
                </NavLink>
              ))}
            </div>

            <NavLink to={navigation.blog.path} className={mobileLinkClasses} onClick={() => setMobileOpen(false)}>
              {navigation.blog.label}
            </NavLink>

            <button
              className={`mt-4 w-full rounded-full py-3 text-sm font-montserrat font-medium transition-colors duration-200 ${variant === 'transparent'
                  ? 'bg-[#FFFFFF7D] text-navy hover:bg-white/90 border border-navy/20'
                  : 'bg-navy text-white hover:bg-navy/90'
                }`}
              onClick={() => navigate('/contact-us')}
            >
              Contact Us
            </button>
          </nav>
        )}
      </div>
    </>
  );
}