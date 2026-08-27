import { useEffect, useState } from 'react';
import type { ChangeEvent, FormEvent } from 'react';

type FormData = {
  name: string;
  lastName: string;
  email: string;
  phone: string;
  address: string;
  city: string;
  howDidYouHear: string;
  additionalMessage: string;
};

type FormErrors = {
  [key in keyof FormData]?: string;
};

const FormSection = () => {
  const [formData, setFormData] = useState<FormData>({
    name: '',
    lastName: '',
    email: '',
    phone: '',
    address: '',
    city: '',
    howDidYouHear: 'Flyer',
    additionalMessage: '',
  });

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errors, setErrors] = useState<FormErrors>({});
  const [modal, setModal] = useState<{
    open: boolean;
    type: 'success' | 'error';
    title: string;
    message: string;
  }>({ open: false, type: 'success', title: '', message: '' });

  const closeModal = () => setModal(prev => ({ ...prev, open: false }));

  useEffect(() => {
    if (!modal.open) return;
    if (modal.type !== 'success') return;
    const timer = window.setTimeout(closeModal, 5000);
    return () => window.clearTimeout(timer);
  }, [modal.open, modal.type]);

  useEffect(() => {
    if (!modal.open) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeModal();
    };
    window.addEventListener('keydown', handleKey);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', handleKey);
      document.body.style.overflow = previousOverflow;
    };
  }, [modal.open]);

  // Validation rules
  // - Names / city: letters, spaces, hyphens, apostrophes and accented chars only.
  // - Email: standard RFC-ish pattern (sufficient for client-side use).
  // - Phone: must contain at least 7 digits; allows + ( ) - and spaces as separators.
  // - Address: min 5 chars and must contain at least one number (street number).
  // - Message: min 10 chars to ensure useful context.
  const NAME_REGEX = /^[A-Za-zÀ-ÿ' -]+$/;
  const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
  const PHONE_ALLOWED_REGEX = /^[+\d\s()-]+$/;

  const validateField = (name: keyof FormData, rawValue: string): string => {
    const value = rawValue.trim();

    switch (name) {
      case 'name':
      case 'lastName': {
        const label = name === 'name' ? 'First name' : 'Last name';
        if (!value) return `${label} is required`;
        if (value.length < 2) return `${label} must be at least 2 characters`;
        if (value.length > 50) return `${label} must be 50 characters or less`;
        if (!NAME_REGEX.test(value)) return `${label} can only contain letters`;
        return '';
      }
      case 'email': {
        if (!value) return 'Email is required';
        if (value.length > 100) return 'Email is too long';
        if (!EMAIL_REGEX.test(value)) return 'Please enter a valid email address';
        return '';
      }
      case 'phone': {
        if (!value) return 'Phone is required';
        if (!PHONE_ALLOWED_REGEX.test(value)) {
          return 'Phone can only contain numbers, spaces, +, -, ( and )';
        }
        const digits = value.replace(/\D/g, '');
        if (digits.length < 7) return 'Phone must contain at least 7 digits';
        if (digits.length > 15) return 'Phone is too long';
        return '';
      }
      case 'address': {
        if (!value) return 'Address is required';
        if (value.length < 5) return 'Please enter a complete address';
        if (value.length > 120) return 'Address is too long';
        if (!/\d/.test(value)) return 'Address should include a street number';
        return '';
      }
      case 'city': {
        if (!value) return 'City is required';
        if (value.length < 2) return 'Please enter a valid city';
        if (value.length > 60) return 'City is too long';
        if (!NAME_REGEX.test(value)) return 'City can only contain letters';
        return '';
      }
      case 'howDidYouHear': {
        if (!value) return 'Please select an option';
        return '';
      }
      case 'additionalMessage': {
        if (!value) return 'Message is required';
        if (value.length < 10) return 'Message must be at least 10 characters';
        if (value.length > 1000) return 'Message must be 1000 characters or less';
        return '';
      }
      default:
        return '';
    }
  };

  const handleChange = (
    e: ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>
  ) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
    // Live-clear an existing error as the user fixes it; do not introduce new
    // errors on every keystroke (that happens on blur / submit).
    if (errors[name as keyof FormErrors]) {
      const message = validateField(name as keyof FormData, value);
      setErrors(prev => ({ ...prev, [name]: message }));
    }
  };

  const handleBlur = (
    e: ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>
  ) => {
    const { name, value } = e.target;
    const message = validateField(name as keyof FormData, value);
    setErrors(prev => ({ ...prev, [name]: message }));
  };

  const validateForm = (): boolean => {
    const newErrors: FormErrors = {};
    (Object.keys(formData) as (keyof FormData)[]).forEach(field => {
      const message = validateField(field, formData[field]);
      if (message) newErrors[field] = message;
    });
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!validateForm()) return;

    setIsSubmitting(true);

    try {
      const response = await fetch(`${import.meta.env.VITE_API_URL}/api/leads/contact`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fullName: `${formData.name} ${formData.lastName}`,
          email: formData.email,
          phone: formData.phone,
          address: `${formData.address}, ${formData.city}`,
          howDidYouHear: formData.howDidYouHear,
          additionalMessage: formData.additionalMessage,
          source: 'contact-form',
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Error sending form');
      }

      (window as any).dataLayer = (window as any).dataLayer || [];
      (window as any).dataLayer.push({
        event: 'form_submission',
        form_type: 'contact_us',
        source: 'contact-form',
        how_did_you_hear: formData.howDidYouHear,
      });

      setModal({
        open: true,
        type: 'success',
        title: 'Message sent successfully!',
        message: 'Thanks for reaching out. We will get back to you soon.',
      });
      setFormData({
        name: '',
        lastName: '',
        email: '',
        phone: '',
        address: '',
        city: '',
        howDidYouHear: 'Flyer',
        additionalMessage: '',
      });
    } catch (error) {
      console.error('Error submitting form:', error);
      setModal({
        open: true,
        type: 'error',
        title: 'Something went wrong',
        message: 'We could not send your message. Please try again.',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    /*
      Outer container:
      - px-4 mobile → px-[5%] tablet → px-6 desktop (prevents text touching edges)
      - max-w-6xl preserved for desktop
    */
    <div className="max-w-6xl mx-auto px-4 md:px-[5%] lg:px-6 py-12">
      {/*
        Grid layout:
        - mobile:  1 column (stacked)
        - tablet:  1 column — form full width, map below
                   At 768–1023px a 2-col grid made both columns too narrow
                   for comfortable form use. Single column reads better.
        - desktop: 2 columns side by side (lg:grid-cols-2) — unchanged
      */}
      <div className="grid gap-8 md:gap-10 lg:gap-12 lg:grid-cols-2 items-start">

        {/* ── Form column ── */}
        <form onSubmit={handleSubmit} id="contact" className="space-y-6 bg-white p-6 md:p-8">
          {/* First / Last — 2 cols from md+ */}
          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <label className="block text-gray-700 font-medium mb-2">
                First Name <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                name="name"
                value={formData.name}
                onChange={handleChange}
                onBlur={handleBlur}
                maxLength={50}
                autoComplete="given-name"
                aria-invalid={!!errors.name}
                aria-describedby={errors.name ? 'name-error' : undefined}
                className={`w-full border rounded-md px-4 py-3 focus:ring-2 focus:ring-blue-500 focus:outline-none text-[16px] ${
                  errors.name ? 'border-red-500' : 'border-gray-300'
                }`}
                placeholder="First name"
              />
              {errors.name && (
                <p id="name-error" className="text-red-500 text-sm mt-1">{errors.name}</p>
              )}
            </div>

            <div>
              <label className="block text-gray-700 font-medium mb-2">
                Last Name <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                name="lastName"
                value={formData.lastName}
                onChange={handleChange}
                onBlur={handleBlur}
                maxLength={50}
                autoComplete="family-name"
                aria-invalid={!!errors.lastName}
                aria-describedby={errors.lastName ? 'lastName-error' : undefined}
                className={`w-full border rounded-md px-4 py-3 focus:ring-2 focus:ring-blue-500 focus:outline-none text-[16px] ${
                  errors.lastName ? 'border-red-500' : 'border-gray-300'
                }`}
                placeholder="Last name"
              />
              {errors.lastName && (
                <p id="lastName-error" className="text-red-500 text-sm mt-1">{errors.lastName}</p>
              )}
            </div>
          </div>

          <div>
            <label className="block text-gray-700 font-medium mb-2">
              Email <span className="text-red-500">*</span>
            </label>
            <input
              type="email"
              name="email"
              value={formData.email}
              onChange={handleChange}
              onBlur={handleBlur}
              maxLength={100}
              autoComplete="email"
              inputMode="email"
              aria-invalid={!!errors.email}
              aria-describedby={errors.email ? 'email-error' : undefined}
              className={`w-full border rounded-md px-4 py-3 focus:ring-2 focus:ring-blue-500 focus:outline-none text-[16px] ${
                errors.email ? 'border-red-500' : 'border-gray-300'
              }`}
              placeholder="youremail@example.com"
            />
            {errors.email && (
              <p id="email-error" className="text-red-500 text-sm mt-1">{errors.email}</p>
            )}
          </div>

          <div>
            <label className="block text-gray-700 font-medium mb-2">
              Phone <span className="text-red-500">*</span>
            </label>
            <input
              type="tel"
              name="phone"
              value={formData.phone}
              onChange={handleChange}
              onBlur={handleBlur}
              maxLength={20}
              autoComplete="tel"
              inputMode="tel"
              aria-invalid={!!errors.phone}
              aria-describedby={errors.phone ? 'phone-error' : undefined}
              className={`w-full border rounded-md px-4 py-3 focus:ring-2 focus:ring-blue-500 focus:outline-none text-[16px] ${
                errors.phone ? 'border-red-500' : 'border-gray-300'
              }`}
              placeholder="e.g. +1 (672) 974-5232"
            />
            {errors.phone && (
              <p id="phone-error" className="text-red-500 text-sm mt-1">{errors.phone}</p>
            )}
          </div>

          <div>
            <label className="block text-gray-700 font-medium mb-2">
              Address <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              name="address"
              value={formData.address}
              onChange={handleChange}
              onBlur={handleBlur}
              maxLength={120}
              autoComplete="street-address"
              aria-invalid={!!errors.address}
              aria-describedby={errors.address ? 'address-error' : undefined}
              className={`w-full border rounded-md px-4 py-3 focus:ring-2 focus:ring-blue-500 focus:outline-none text-[16px] ${
                errors.address ? 'border-red-500' : 'border-gray-300'
              }`}
              placeholder="e.g. 1295 Craigflower Rd"
            />
            {errors.address && (
              <p id="address-error" className="text-red-500 text-sm mt-1">{errors.address}</p>
            )}
          </div>

          <div>
            <label className="block text-gray-700 font-medium mb-2">
              City <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              name="city"
              value={formData.city}
              onChange={handleChange}
              onBlur={handleBlur}
              maxLength={60}
              autoComplete="address-level2"
              aria-invalid={!!errors.city}
              aria-describedby={errors.city ? 'city-error' : undefined}
              className={`w-full border rounded-md px-4 py-3 focus:ring-2 focus:ring-blue-500 focus:outline-none text-[16px] ${
                errors.city ? 'border-red-500' : 'border-gray-300'
              }`}
              placeholder="City"
            />
            {errors.city && (
              <p id="city-error" className="text-red-500 text-sm mt-1">{errors.city}</p>
            )}
          </div>

          <div>
            <label className="block text-gray-700 font-medium mb-2">
              How did you hear about us? <span className="text-red-500">*</span>
            </label>
            <select
              name="howDidYouHear"
              value={formData.howDidYouHear}
              onChange={handleChange}
              className="w-full border border-gray-300 rounded-md px-4 py-3 focus:ring-2 focus:ring-blue-500 focus:outline-none text-[16px]"
            >
              <option value="Flyer">Flyer</option>
              <option value="Google">Google</option>
              <option value="Facebook">Facebook</option>
              <option value="Instagram">Instagram</option>
              <option value="Referred by a friend">Referred by a friend</option>
              <option value="Other">Other</option>
            </select>
          </div>

          <div>
            <label className="block text-gray-700 font-medium mb-2">
              Additional Message <span className="text-red-500">*</span>
            </label>
            <textarea
              name="additionalMessage"
              value={formData.additionalMessage}
              onChange={handleChange}
              onBlur={handleBlur}
              maxLength={1000}
              aria-invalid={!!errors.additionalMessage}
              aria-describedby={errors.additionalMessage ? 'message-error' : 'message-counter'}
              className={`w-full border rounded-md px-4 py-3 h-32 resize-none focus:ring-2 focus:ring-blue-500 focus:outline-none text-[16px] ${
                errors.additionalMessage ? 'border-red-500' : 'border-gray-300'
              }`}
              placeholder="Please describe what you need help with. The more details, the better!"
            />
            <div className="flex items-start justify-between gap-3 mt-1">
              {errors.additionalMessage ? (
                <p id="message-error" className="text-red-500 text-sm">
                  {errors.additionalMessage}
                </p>
              ) : (
                <span className="text-sm text-transparent select-none">.</span>
              )}
              <span
                id="message-counter"
                className={`text-xs flex-shrink-0 ${
                  formData.additionalMessage.length > 1000 ? 'text-red-500' : 'text-gray-400'
                }`}
              >
                {formData.additionalMessage.length}/1000
              </span>
            </div>
          </div>

          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full bg-[#031634] text-white py-3 px-6 rounded-md font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isSubmitting ? 'Sending...' : 'Send Message'}
          </button>
        </form>

        {/* ── Info + map column ── */}
        <div className="space-y-6 lg:mt-[30px]">
          <div>
            <h2 className="text-2xl font-semibold mb-4 text-[#031634]">Our Location</h2>

            <div className="flex items-center mb-3">
              <svg className="w-5 h-5 text-[#031634] mr-3 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
              </svg>
              <a
                href="tel:+16045550142"
                className="text-gray-700 hover:text-[#031634] hover:underline transition-colors font-medium"
              >
                Phone: 1 (672) 974-5232
              </a>
            </div>

            <div className="flex items-center mb-3">
              <svg className="w-5 h-5 text-[#031634] mr-3 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 4.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
              </svg>
              <a 
                href="mailto:joaquin.labtinos@gmail.com" 
                className="text-gray-700 hover:text-[#031634] hover:underline transition-colors font-medium"
              >
                Email: joaquin.labtinos@gmail.com
              </a>
            </div>
          </div>

          {/*
            Map iframe:
            - height="740" was fixed and oversized on tablets in single-column layout
            - Now uses a responsive wrapper: aspect-ratio on tablet, fixed height on desktop
            - lg:h-[740px] restores the original desktop height
          */}
          <div className="w-full lg:h-[740px] aspect-video lg:aspect-auto">
            <iframe
              width="100%"
              height="100%"
              className="rounded-lg shadow-lg"
              loading="lazy"
              allowFullScreen
              src="https://maps.google.com/maps?q=1295%20Craigflower%20Rd,%20Victoria,%20BC%20V9A%200H7,%20Canada&z=15&output=embed"
              title="Our Location"
            />
          </div>
        </div>
      </div>

      {modal.open && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="contact-modal-title"
          aria-describedby="contact-modal-description"
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center px-4 py-6 sm:p-6 bg-black/50 backdrop-blur-sm animate-[fadeIn_0.2s_ease-out]"
          onClick={closeModal}
        >
          <div
            className="relative w-full max-w-md bg-white rounded-2xl shadow-2xl p-6 sm:p-8 animate-[slideUp_0.25s_ease-out]"
            onClick={e => e.stopPropagation()}
          >
            <button
              type="button"
              onClick={closeModal}
              aria-label="Close"
              className="absolute top-3 right-3 p-2 rounded-full text-gray-500 hover:text-gray-800 hover:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-gray-300 transition-colors"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>

            <div className="flex flex-col items-center text-center">
              <div
                className={`flex items-center justify-center w-14 h-14 rounded-full mb-4 ${
                  modal.type === 'success' ? 'bg-green-100' : 'bg-red-100'
                }`}
              >
                {modal.type === 'success' ? (
                  <svg className="w-8 h-8 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                  </svg>
                ) : (
                  <svg className="w-8 h-8 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 9v3m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
                  </svg>
                )}
              </div>

              <h3
                id="contact-modal-title"
                className="text-xl sm:text-2xl font-semibold text-[#031634] mb-2"
              >
                {modal.title}
              </h3>
              <p
                id="contact-modal-description"
                className="text-gray-600 text-base mb-6"
              >
                {modal.message}
              </p>

              <button
                type="button"
                onClick={closeModal}
                className="w-full sm:w-auto sm:min-w-[140px] bg-[#031634] hover:bg-[#0a2752] text-white py-3 px-6 rounded-md font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-[#031634]"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default FormSection;