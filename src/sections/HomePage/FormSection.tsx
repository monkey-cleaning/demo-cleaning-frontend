import { useState, useEffect } from 'react';
import { ChevronRight, ChevronLeft } from 'lucide-react';
import logoDesktop from '../../assets/logo-desktop.png';
import whatsappIcon from '../../assets/whatsapp.png';

const STORAGE_KEY = 'monkeyCleaningFormData';
const RECAPTCHA_SITE_KEY = import.meta.env.VITE_RECAPTCHA_SITE_KEY as string;
const WHATSAPP_NUMBER = '16729745232';
const WHATSAPP_MESSAGE =
  "Hi! I'm interested in booking a cleaning service with Demo Cleaning Co..";
const WHATSAPP_URL = `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(
  WHATSAPP_MESSAGE
)}`;


interface FormSectionProps {
  defaultFormType?: 'general' | 'specialized';
}

export default function FormSection({ defaultFormType = 'general' }: FormSectionProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [formType, setFormType] = useState<'general' | 'specialized'>(defaultFormType);
  const [currentStep, setCurrentStep] = useState(1);
  const [submitted, setSubmitted] = useState(false);

  // Returns today's date as YYYY-MM-DD (used for min attribute and validation)
  const getTodayString = () => {
    const today = new Date();
    const yyyy = today.getFullYear();
    const mm = String(today.getMonth() + 1).padStart(2, '0');
    const dd = String(today.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
  };

  // Load from localStorage on mount
  const loadFromStorage = () => {
    const defaults = {
      fullName: '',
      email: '',
      phone: '',
      address: '',
      serviceOption: '',
      cleaningFrequency: '',
      propertySize: '',
      bedrooms: '',
      fullBathrooms: '',
      halfBathrooms: '',
      pets: '',
      insideFridge: '',
      insideFreezer: '',
      insideOven: '',
      insideWindows: '',
      deepCleaned: '',
      closeToHiring: '',
      cleaningDate: '',
      availabilityWindows: [] as {day: string; start: string; end: string}[],
      preferredDays: [] as string[],
      preferredTime: [] as string[],
      additionalMessage: ''
    };
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        // Discard a stored cleaningDate if it's already in the past
        const savedDate = parsed.cleaningDate ?? '';
        const cleaningDate = savedDate && savedDate >= getTodayString() ? savedDate : '';

        return {
          ...defaults,
          ...parsed,
          cleaningDate,
          availabilityWindows: Array.isArray(parsed.availabilityWindows) ? parsed.availabilityWindows : [],
          preferredDays: Array.isArray(parsed.preferredDays) ? parsed.preferredDays : [],
          preferredTime: Array.isArray(parsed.preferredTime) ? parsed.preferredTime : (parsed.preferredTime ? [parsed.preferredTime] : []),
        };
      }
    } catch (e) {
      console.error('Error loading from localStorage:', e);
    }
    return defaults;
  };

  const [formData, setFormData] = useState(loadFromStorage);

  // Save to localStorage whenever formData changes
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(formData));
    } catch (e) {
      console.error('Error saving to localStorage:', e);
    }
  }, [formData]);

  // FIX: When form type changes, clear serviceOption so the user
  // must pick a valid option from the new list before continuing.
  const handleFormTypeChange = (newType: 'general' | 'specialized') => {
    setFormType(newType);
    setFormData((prev: typeof formData) => ({ ...prev, serviceOption: '' }));
    setError(null);
    setFieldErrors({});
  };

  // 🛡️ Cargar script de Google reCAPTCHA v3
  useEffect(() => {
    if (!RECAPTCHA_SITE_KEY) return;

    const existingScript = document.querySelector<HTMLScriptElement>(
      `script[src^="https://www.google.com/recaptcha/api.js?render="]`
    );
    if (existingScript) return;

    const script = document.createElement('script');
    script.src = `https://www.google.com/recaptcha/api.js?render=${RECAPTCHA_SITE_KEY}`;
    script.async = true;
    document.body.appendChild(script);

    return () => {
      // opcional: si querés limpiar el script al desmontar el componente
      // document.body.removeChild(script);
    };
  }, []);

  const steps = [
    { number: 1, title: 'Personal Information', description: "Let's start with your basic details" },
    { number: 2, title: 'Service details', description: 'Specify the frequency and features of your property' },
    { number: 3, title: 'Service customization', description: 'Select the specific areas you would like us to clean' },
    { number: 4, title: 'Finalize your booking', description: "You're almost there! Just choose your preferred schedule" }
  ];

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setFormData({ ...formData, [name]: value });
    if (fieldErrors[name]) setFieldErrors(prev => { const next = { ...prev }; delete next[name]; return next; });
  };

  const handleCheckboxChange = (name: string, value: string, checked: boolean) => {
    setFormData((prev: typeof formData) => {
      const current: string[] = Array.isArray((prev as any)[name]) ? (prev as any)[name] : [];
      const updated = checked ? [...current, value] : current.filter((v) => v !== value);
      return { ...prev, [name]: updated };
    });
  };

  const isValidEmail = (email: string): boolean => {
    if (!email) return false;
    const emailRegex = /^[^\s@]+@([^\s@]+\.)+[^\s@]+$/;
    return emailRegex.test(email);
  };

  // Returns a map of fieldName → error message for all invalid required fields in a step.
  // Empty map means the step is valid.
  const getStepErrors = (step: number): Record<string, string> => {
    const errs: Record<string, string> = {};
    switch (step) {
      case 1:
        if (!formData.fullName) errs['fullName'] = 'Full name is required';
        if (!formData.email) errs['email'] = 'Email is required';
        else if (!isValidEmail(formData.email)) errs['email'] = 'Please enter a valid email address';
        if (!formData.address) errs['address'] = 'Address is required';
        if (!formData.phone) errs['phone'] = 'Phone number is required';
        if (!formData.serviceOption || !serviceOptions[formType].includes(formData.serviceOption))
          errs['serviceOption'] = 'Please select a service';
        break;
      case 2:
        if (!formData.cleaningFrequency) errs['cleaningFrequency'] = 'Please select a cleaning frequency';
        if (!formData.propertySize) errs['propertySize'] = 'Please select a property size';
        if (!formData.bedrooms) errs['bedrooms'] = 'Please select number of bedrooms';
        if (!formData.fullBathrooms) errs['fullBathrooms'] = 'Please select number of full bathrooms';
        if (!formData.halfBathrooms) errs['halfBathrooms'] = 'Please select number of half bathrooms';
        break;
      case 3:
        if (!formData.pets) errs['pets'] = 'Please select an option';
        if (!formData.insideFridge) errs['insideFridge'] = 'Please select an option';
        if (!formData.insideFreezer) errs['insideFreezer'] = 'Please select an option';
        if (!formData.insideOven) errs['insideOven'] = 'Please select an option';
        if (!formData.insideWindows) errs['insideWindows'] = 'Please select an option';
        break;
      case 4:
        if (!formData.deepCleaned) errs['deepCleaned'] = 'Please select an option';
        if (!formData.closeToHiring) errs['closeToHiring'] = 'Please select your status';
        if (!formData.cleaningDate) {
          errs['cleaningDate'] = 'Please choose a cleaning date';
        } else if (formData.cleaningDate < getTodayString()) {
          errs['cleaningDate'] = 'Please choose a date that is today or in the future';
        }
        break;
    }
    return errs;
  };

  // Focus the first invalid field — works for both desktop ids and mobile ids (suffix "Mobile").
  const focusFirstError = (errs: Record<string, string>) => {
    const firstField = Object.keys(errs)[0];
    if (!firstField) return;
    const el = document.getElementById(firstField) ?? document.getElementById(firstField + 'Mobile');
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      el.focus();
    }
  };

  const handleNext = () => {
    const errs = getStepErrors(currentStep);
    if (Object.keys(errs).length === 0) {
      setFieldErrors({});
      setError(null);
      setCurrentStep(prev => Math.min(prev + 1, 4));
    } else {
      setFieldErrors(errs);
      setError('Please fill in all required fields');
      focusFirstError(errs);
    }
  };

  const handleBack = () => {
    setCurrentStep(prev => Math.max(prev - 1, 1));
    setError(null);
    setFieldErrors({});
  };

  async function handleSubmit() {
    const errs = getStepErrors(4);
    if (Object.keys(errs).length > 0) {
      setFieldErrors(errs);
      setError('Please fill in all required fields');
      focusFirstError(errs);
      return;
    }

    if (!isValidEmail(formData.email)) {
      setError('Please enter a valid email address (e.g., name@domain.com)');
      return;
    }

    if (!RECAPTCHA_SITE_KEY) {
      setError('reCAPTCHA is not configured. Please contact support.');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      // 🛡️ Ejecutar reCAPTCHA v3
      const grecaptcha = (window as any).grecaptcha;
      if (!grecaptcha) {
        throw new Error('reCAPTCHA is not loaded yet. Please try again in a moment.');
      }

      const recaptchaToken = await grecaptcha.execute(RECAPTCHA_SITE_KEY, { action: 'submit' });

      const payload = {
        ...formData,
        serviceType: formType,
        recaptchaToken,
      };

      const res = await fetch(`${import.meta.env.VITE_API_URL}/api/leads`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.error || 'Unexpected error');
      }

      (window as any).dataLayer = (window as any).dataLayer || [];
      (window as any).dataLayer.push({
        event: 'form_submission',
        form_type: 'quote_request',
      });

      // Clear localStorage after successful submission
      localStorage.removeItem(STORAGE_KEY);

      // Show thank you message instead of redirecting
      setSubmitted(true);
    } catch (err: any) {
      setError(err.message || 'Error sending form');
    } finally {
      setLoading(false);
    }
  }

  const serviceOptions = {
    general: ['House Cleaning', 'Office Cleaning', 'Apartment Cleaning'],
    specialized: [/*'Furniture Cleaning',*/ 'Carpet Cleaning', 'Tile Cleaning']
  };

  const cleaningFrequencies = ['Weekly', 'Biweekly', 'Monthly', 'One Time Cleaning', 'Move In / Move Out'];
  const propertySizes = ['0 - 999 Sq Ft', '1000 - 1499 Sq Ft', '1500 - 1999 Sq Ft', '2000 - 2499 Sq Ft', '2500+ Sq Ft'];
  const bedroomOptions = ['Studio', 'One Bedroom', 'Two Bedrooms', 'Three Bedrooms', 'Four+ Bedrooms'];
  const bathroomOptions = ['1 Bathroom', '2 Bathrooms', '3 Bathrooms', '4+ Bathrooms'];
  const halfBathroomOptions = ['0 Half Bathrooms', '1 Half Bathroom', '2 Half Bathrooms', '3+ Half Bathrooms'];
  const yesNoOptions = ['Yes', 'No'];
  const windowOptions = ['0', '1-5', '6-10', '11-15', '16+'];
  const hiringOptions = ["I'm ready to hire now", "I'm planning and researching", "I'm definetely going to hire someone", "I will possibly hire someone"];
  const daysOfWeek = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
  const preferredTimeOptions = [
    { value: 'morning', label: 'Morning (8am–12pm)' },
    { value: 'afternoon', label: 'Afternoon (12pm–5pm)' },
    { value: 'evening', label: 'Evening (5pm–8pm)' },
  ];

  // Returns the border class for a field — red ring when there's a validation error.
  const fieldClass = (name: string, base: string) =>
    fieldErrors[name] ? base.replace('border-[#D9DBE9]', 'border-red-400') + ' ring-1 ring-red-400' : base;

  const renderStepContent = () => {
    switch (currentStep) {
      case 1:
        return (
          <div className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <label htmlFor="fullName" className="block text-sm font-medium text-[#031634] mb-2 leading-[100%]">
                  Full name*
                </label>
                <input
                  id="fullName"
                  name="fullName"
                  type="text"
                  required
                  value={formData.fullName}
                  onChange={handleInputChange}
                  className={fieldClass('fullName', 'w-full h-12 border border-[#D9DBE9] rounded-[14px] px-4 py-2 text-sm')}
                  placeholder="Eg. John Carter"
                />
                  {fieldErrors['fullName'] && <p className="text-xs text-red-500 mt-1">{fieldErrors['fullName']}</p>}
              </div>

              <div>
                <label htmlFor="email" className="block text-sm font-medium text-[#031634] mb-2 leading-[100%]">
                  Email*
                </label>
                <input
                  id="email"
                  name="email"
                  type="email"
                  required
                  value={formData.email}
                  onChange={handleInputChange}
                  className={fieldClass('email', 'w-full h-12 border border-[#D9DBE9] rounded-[14px] px-4 py-2 text-sm')}
                  placeholder="Enter your email"
                  pattern="[^\s@]+@([^\s@]+\.)+[^\s@]+"
                  title="Please enter a valid email address"
                />
                {fieldErrors['email'] && <p className="text-xs text-red-500 mt-1">{fieldErrors['email']}</p>}
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <label htmlFor="address" className="block text-sm font-medium text-[#031634] mb-2 leading-[100%]">
                  Address*
                </label>
                <input
                  id="address"
                  name="address"
                  type="text"
                  required
                  value={formData.address}
                  onChange={handleInputChange}
                  className={fieldClass('address', 'w-full h-12 border border-[#D9DBE9] rounded-[14px] px-4 py-2 text-sm')}
                  placeholder="Eg. 1234 Douglas St, Victoria, BC"
                />
                {fieldErrors['address'] && <p className="text-xs text-red-500 mt-1">{fieldErrors['address']}</p>}
              </div>

              <div>
                <label htmlFor="phone" className="block text-sm font-medium text-[#031634] mb-2 leading-[100%]">
                  Phone number*
                </label>
                <input
                  id="phone"
                  name="phone"
                  type="tel"
                  required
                  value={formData.phone}
                  onChange={handleInputChange}
                  className={fieldClass('phone', 'w-full h-12 border border-[#D9DBE9] rounded-[14px] px-4 py-2 text-sm')}
                  placeholder="(250) 555-0123"
                />
                {fieldErrors['phone'] && <p className="text-xs text-red-500 mt-1">{fieldErrors['phone']}</p>}
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <label htmlFor="serviceOption" className="block text-sm font-medium text-[#031634] mb-2 leading-[100%]">
                  Type of service*
                </label>
                <select
                  id="serviceOption"
                  name="serviceOption"
                  required
                  value={formData.serviceOption}
                  onChange={handleInputChange}
                  className={fieldClass('serviceOption', 'w-full h-12 border border-[#D9DBE9] rounded-[14px] px-4 py-2 text-sm')}
                >
                  <option value="">Select a service</option>
                  {serviceOptions[formType].map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
                {fieldErrors['serviceOption'] && <p className="text-xs text-red-500 mt-1">{fieldErrors['serviceOption']}</p>}
              </div>
            </div>
          </div>
        );

      case 2:
        return (
          <div className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <label htmlFor="cleaningFrequency" className="block text-sm font-medium text-[#031634] mb-2 leading-[100%]">
                  Cleaning Frequency*
                </label>
                <select
                  id="cleaningFrequency"
                  name="cleaningFrequency"
                  required
                  value={formData.cleaningFrequency}
                  onChange={handleInputChange}
                  className={fieldClass('cleaningFrequency', 'w-full h-12 border border-[#D9DBE9] rounded-[14px] px-4 py-2 text-sm')}
                >
                  <option value="">Select frequency</option>
                  {cleaningFrequencies.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
                {fieldErrors['cleaningFrequency'] && <p className="text-xs text-red-500 mt-1">{fieldErrors['cleaningFrequency']}</p>}
              </div>

              <div>
                <label htmlFor="propertySize" className="block text-sm font-medium text-[#031634] mb-2 leading-[100%]">
                  Property Size*
                </label>
                <select
                  id="propertySize"
                  name="propertySize"
                  required
                  value={formData.propertySize}
                  onChange={handleInputChange}
                  className={fieldClass('propertySize', 'w-full h-12 border border-[#D9DBE9] rounded-[14px] px-4 py-2 text-sm')}
                >
                  <option value="">Select size</option>
                  {propertySizes.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
                {fieldErrors['propertySize'] && <p className="text-xs text-red-500 mt-1">{fieldErrors['propertySize']}</p>}
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <label htmlFor="bedrooms" className="block text-sm font-medium text-[#031634] mb-2 leading-[100%]">
                  Number of Bedrooms*
                </label>
                <select
                  id="bedrooms"
                  name="bedrooms"
                  required
                  value={formData.bedrooms}
                  onChange={handleInputChange}
                  className={fieldClass('bedrooms', 'w-full h-12 border border-[#D9DBE9] rounded-[14px] px-4 py-2 text-sm')}
                >
                  <option value="">Select bedrooms</option>
                  {bedroomOptions.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
                {fieldErrors['bedrooms'] && <p className="text-xs text-red-500 mt-1">{fieldErrors['bedrooms']}</p>}
              </div>

              <div>
                <label htmlFor="fullBathrooms" className="block text-sm font-medium text-[#031634] mb-2 leading-[100%]">
                  Number of Full Bathrooms*
                </label>
                <select
                  id="fullBathrooms"
                  name="fullBathrooms"
                  required
                  value={formData.fullBathrooms}
                  onChange={handleInputChange}
                  className={fieldClass('fullBathrooms', 'w-full h-12 border border-[#D9DBE9] rounded-[14px] px-4 py-2 text-sm')}
                >
                  <option value="">Select bathrooms</option>
                  {bathroomOptions.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
                {fieldErrors['fullBathrooms'] && <p className="text-xs text-red-500 mt-1">{fieldErrors['fullBathrooms']}</p>}
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <label htmlFor="halfBathrooms" className="block text-sm font-medium text-[#031634] mb-2 leading-[100%]">
                  Number of Half Bathrooms*
                </label>
                <select
                  id="halfBathrooms"
                  name="halfBathrooms"
                  required
                  value={formData.halfBathrooms}
                  onChange={handleInputChange}
                  className={fieldClass('halfBathrooms', 'w-full h-12 border border-[#D9DBE9] rounded-[14px] px-4 py-2 text-sm')}
                >
                  <option value="">Select half bathrooms</option>
                  {halfBathroomOptions.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
                {fieldErrors['halfBathrooms'] && <p className="text-xs text-red-500 mt-1">{fieldErrors['halfBathrooms']}</p>}
              </div>
            </div>
          </div>
        );

      case 3:
        return (
          <div className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <label htmlFor="pets" className="block text-sm font-medium text-[#031634] mb-2 leading-[100%]">
                  Pets*
                </label>
                <select
                  id="pets"
                  name="pets"
                  required
                  value={formData.pets}
                  onChange={handleInputChange}
                  className={fieldClass('pets', 'w-full h-12 border border-[#D9DBE9] rounded-[14px] px-4 py-2 text-sm')}
                >
                  <option value="">Select option</option>
                  {yesNoOptions.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
                {fieldErrors['pets'] && <p className="text-xs text-red-500 mt-1">{fieldErrors['pets']}</p>}
              </div>

              <div>
                <label htmlFor="insideFridge" className="block text-sm font-medium text-[#031634] mb-2 leading-[100%]">
                  Inside the Fridge*
                </label>
                <select
                  id="insideFridge"
                  name="insideFridge"
                  required
                  value={formData.insideFridge}
                  onChange={handleInputChange}
                  className={fieldClass('insideFridge', 'w-full h-12 border border-[#D9DBE9] rounded-[14px] px-4 py-2 text-sm')}
                >
                  <option value="">Select option</option>
                  {yesNoOptions.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
                {fieldErrors['insideFridge'] && <p className="text-xs text-red-500 mt-1">{fieldErrors['insideFridge']}</p>}
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <label htmlFor="insideFreezer" className="block text-sm font-medium text-[#031634] mb-2 leading-[100%]">
                  Inside the Freezer*
                </label>
                <select
                  id="insideFreezer"
                  name="insideFreezer"
                  required
                  value={formData.insideFreezer}
                  onChange={handleInputChange}
                  className={fieldClass('insideFreezer', 'w-full h-12 border border-[#D9DBE9] rounded-[14px] px-4 py-2 text-sm')}
                >
                  <option value="">Select option</option>
                  {yesNoOptions.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
                {fieldErrors['insideFreezer'] && <p className="text-xs text-red-500 mt-1">{fieldErrors['insideFreezer']}</p>}
              </div>

              <div>
                <label htmlFor="insideOven" className="block text-sm font-medium text-[#031634] mb-2 leading-[100%]">
                  Inside the Oven*
                </label>
                <select
                  id="insideOven"
                  name="insideOven"
                  required
                  value={formData.insideOven}
                  onChange={handleInputChange}
                  className={fieldClass('insideOven', 'w-full h-12 border border-[#D9DBE9] rounded-[14px] px-4 py-2 text-sm')}
                >
                  <option value="">Select option</option>
                  {yesNoOptions.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
                {fieldErrors['insideOven'] && <p className="text-xs text-red-500 mt-1">{fieldErrors['insideOven']}</p>}
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <label htmlFor="insideWindows" className="block text-sm font-medium text-[#031634] mb-2 leading-[100%]">
                  Inside Windows*
                </label>
                <select
                  id="insideWindows"
                  name="insideWindows"
                  required
                  value={formData.insideWindows}
                  onChange={handleInputChange}
                  className={fieldClass('insideWindows', 'w-full h-12 border border-[#D9DBE9] rounded-[14px] px-4 py-2 text-sm')}
                >
                  <option value="">Select number of windows</option>
                  {windowOptions.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
                {fieldErrors['insideWindows'] && <p className="text-xs text-red-500 mt-1">{fieldErrors['insideWindows']}</p>}
              </div>
            </div>
          </div>
        );

      case 4:
        return (
          <div className="space-y-6">
            <div className="grid grid-cols-1 gap-6">
              <div>
                <label htmlFor="deepCleaned" className="block text-sm font-medium text-[#031634] mb-2 leading-[100%]">
                  My house/office was deep cleaned by a professional cleaner in the last 30 days*
                </label>
                <select
                  id="deepCleaned"
                  name="deepCleaned"
                  required
                  value={formData.deepCleaned}
                  onChange={handleInputChange}
                  className={fieldClass('deepCleaned', 'w-full h-12 border border-[#D9DBE9] rounded-[14px] px-4 py-2 text-sm')}
                >
                  <option value="">Select option</option>
                  {yesNoOptions.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
                {fieldErrors['deepCleaned'] && <p className="text-xs text-red-500 mt-1">{fieldErrors['deepCleaned']}</p>}
              </div>

              <div>
                <label htmlFor="closeToHiring" className="block text-sm font-medium text-[#031634] mb-2 leading-[100%]">
                  Close to hiring us for cleaning?*
                </label>
                <select
                  id="closeToHiring"
                  name="closeToHiring"
                  required
                  value={formData.closeToHiring}
                  onChange={handleInputChange}
                  className={fieldClass('closeToHiring', 'w-full h-12 border border-[#D9DBE9] rounded-[14px] px-4 py-2 text-sm')}
                >
                  <option value="">Select your status</option>
                  {hiringOptions.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
                {fieldErrors['closeToHiring'] && <p className="text-xs text-red-500 mt-1">{fieldErrors['closeToHiring']}</p>}
              </div>

              {/* Date Selector */}
              <div>
                <label htmlFor="cleaningDate" className="block text-sm font-medium text-[#031634] mb-2 leading-[100%]">
                  Choose Your Ideal Cleaning Day!*
                </label>
                <input
                  id="cleaningDate"
                  name="cleaningDate"
                  type="date"
                  required
                  min={getTodayString()}
                  value={formData.cleaningDate}
                  onChange={handleInputChange}
                  className={fieldClass('cleaningDate', 'w-full h-12 border border-[#D9DBE9] rounded-[14px] px-4 py-2 text-sm')}
                  placeholder="Select a tentative day for sparkle"
                />
                {fieldErrors['cleaningDate'] && <p className="text-xs text-red-500 mt-1">{fieldErrors['cleaningDate']}</p>}
              </div>

              {/* Preferred Days */}
              <div>
                <label className="block text-sm font-medium text-[#031634] mb-3 leading-[100%]">
                  Preferred days <span className="text-[#6F6C8F] font-normal">(optional)</span>
                </label>
                <div className="border border-[#D9DBE9] rounded-[14px] px-4 py-3 flex flex-wrap gap-x-6 gap-y-3">
                  {daysOfWeek.map((day) => (
                    <label key={day} className="flex items-center gap-2 cursor-pointer text-sm text-[#031634]">
                      <input
                        type="checkbox"
                        checked={(formData.preferredDays as string[]).includes(day)}
                        onChange={(e) => handleCheckboxChange('preferredDays', day, e.target.checked)}
                        className="w-4 h-4 accent-[#031634] cursor-pointer"
                      />
                      {day}
                    </label>
                  ))}
                </div>
              </div>

              {/* Preferred Time — multi-select checkboxes */}
              <div>
                <label className="block text-sm font-medium text-[#031634] mb-3 leading-[100%]">
                  Preferred time <span className="text-[#6F6C8F] font-normal">(optional)</span>
                </label>
                <div className="border border-[#D9DBE9] rounded-[14px] px-4 py-3 flex flex-wrap gap-x-6 gap-y-3">
                  {preferredTimeOptions.map((opt) => (
                    <label key={opt.value} className="flex items-center gap-2 cursor-pointer text-sm text-[#031634]">
                      <input
                        type="checkbox"
                        checked={(formData.preferredTime as string[]).includes(opt.value)}
                        onChange={(e) => handleCheckboxChange('preferredTime', opt.value, e.target.checked)}
                        className="w-4 h-4 accent-[#031634] cursor-pointer"
                      />
                      {opt.label}
                    </label>
                  ))}
                </div>
              </div>

              {/* Additional Message Field */}
              <div>
                <label htmlFor="additionalMessage" className="block text-sm font-medium text-[#031634] mb-2 leading-[100%]">
                  Additional message
                </label>
                <textarea
                  id="additionalMessage"
                  name="additionalMessage"
                  value={formData.additionalMessage}
                  onChange={handleInputChange}
                  className="w-full min-h-[100px] border border-[#D9DBE9] rounded-[14px] px-4 py-3 text-sm resize-y"
                  placeholder="Any special instructions or additional information..."
                />
              </div>
            </div>
          </div>
        );

      default:
        return null;
    }
  };

  const renderThankYouMessage = () => (
    <div className="text-center py-12">
      <div className="bg-green-50 rounded-[24px] p-8 border border-green-200">
        <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-6">
          <svg className="w-8 h-8 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
        </div>
        <h2 className="font-bold text-2xl text-[#031634] mb-4 leading-[100%]">
          Thank You for Your Booking!
        </h2>
        <p className="text-lg text-gray-600 mb-2">
          We've received your cleaning service request.
        </p>
        <p className="text-lg text-gray-600 mb-6">
          Our team will contact you within 24 hours to confirm your appointment.
        </p>
        <div className="bg-white rounded-[16px] p-6 border border-[#D9DBE9] max-w-md mx-auto">
          <h3 className="font-semibold text-lg text-[#031634] mb-4">Booking Details</h3>
          <div className="space-y-2 text-sm text-left">
            <div className="flex justify-between">
              <span className="text-gray-600">Service:</span>
              <span className="font-semibold">{formData.serviceOption}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-600">Frequency:</span>
              <span className="font-semibold">{formData.cleaningFrequency}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-600">Date:</span>
              <span className="font-semibold">{formData.cleaningDate}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-600">Property:</span>
              <span className="font-semibold">{formData.propertySize}</span>
            </div>
            {formData.additionalMessage && (
              <div className="flex justify-between">
                <span className="text-gray-600">Additional Notes:</span>
                <span className="font-semibold max-w-[200px] text-right truncate">
                  {formData.additionalMessage}
                </span>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );

  if (submitted) {
    return (
      <section id="contact" className="w-full px-4 md:px-8 lg:px-[76px] py-8 md:py-16">
        <div className="hidden md:block max-w-[1288px] mx-auto">
          <div className="bg-[#031634] rounded-[32px] p-7 lg:p-[60px] border border-[#031634]">
            <div className="flex gap-[28px]">
              {/* Left Sidebar */}
              <div className="w-[200px] lg:w-[348px] bg-[#F1F0FB] rounded-[24px] border border-[#F1F2F9] p-4 lg:p-6 flex flex-col justify-between flex-shrink-0">
                <div>
                  {/* Logo */}
                  <div className="mb-8 justify-center items-center mx-auto">
                    <img src={logoDesktop} alt="Demo Cleaning Co." className="h-12 mx-auto" />
                  </div>

                  {/* Steps - All completed */}
                  <div className="space-y-0">
                    {steps.map((step, idx) => (
                      <div key={step.number} className="flex gap-4">
                        <div className="flex flex-col items-center">
                          <div className="w-[34px] h-[34px] rounded-[8px] flex items-center justify-center bg-[#031634] border-[0.5px] border-[#A6A6A6]">
                            <span className="font-semibold text-sm text-white">
                              {step.number}
                            </span>
                          </div>
                          {idx < steps.length - 1 && (
                            <div className="w-[1px] h-[40px] bg-[#A6A6A6] my-3" />
                          )}
                        </div>
                        <div className="pb-6">
                          <h3 className="font-semibold text-sm text-[#031634] leading-[115%]">
                            {step.title}
                          </h3>
                          <p className="text-xs text-black opacity-60 leading-[150%] mt-1 font-['Quicksand']">
                            {step.description}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Need Help */}
                <div className="flex items-center justify-between pt-4">
                  <div>
                    <p className="font-semibold text-sm text-[#031634] leading-[115%]">Need a help?</p>
                    <p className="text-xs text-black opacity-60 leading-[150%] font-['Quicksand']">
                      chat with live support
                    </p>
                  </div>
                  <a
                    href={WHATSAPP_URL}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="w-[34px] h-[34px] rounded-lg border-[0.5px] border-[#F1F2F9] bg-gradient-to-b from-white to-[#F1F2F9] flex items-center justify-center"
                  >
                    <img src={whatsappIcon} alt="WhatsApp" className="w-4 h-4" />
                  </a>
                </div>
              </div>

              {/* Right Form Area - Thank You Message */}
              <div className="flex-1 min-w-0">
                <div className="bg-white rounded-[24px] border border-[#CDB380] p-6 lg:p-12">
                  {renderThankYouMessage()}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Mobile Thank You Message */}
        <div className="md:hidden max-w-[363px] mx-auto mt-[-70px]">
          <div className="bg-[#F1F0FB] rounded-[28px] p-6">
            <div className="text-center mb-10">
              <img src={logoDesktop} alt="Demo Cleaning Co." className="h-12 w-auto mx-auto" />
            </div>
            <div className="bg-white rounded-[20px] p-6 border border-green-200">
              <div className="w-12 h-12 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <svg className="w-6 h-6 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <h2 className="font-bold text-xl text-[#031634] mb-3 text-center">
                Thank You!
              </h2>
              <p className="text-sm text-gray-600 mb-4 text-center">
                We've received your request and will contact you soon to confirm your cleaning appointment.
              </p>
              <div className="bg-gray-50 rounded-[12px] p-4 mt-4">
                <h3 className="font-semibold text-sm text-[#031634] mb-3 text-center">Your Booking</h3>
                <div className="space-y-1 text-xs">
                  <div className="flex justify-between">
                    <span className="text-gray-600">Service:</span>
                    <span className="font-semibold">{formData.serviceOption}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600">Date:</span>
                    <span className="font-semibold">{formData.cleaningDate}</span>
                  </div>
                  {formData.additionalMessage && (
                    <div className="flex justify-between">
                      <span className="text-gray-600">Notes:</span>
                      <span className="font-semibold max-w-[150px] text-right">{formData.additionalMessage}</span>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section id="contact" className="w-full px-4 md:px-8 lg:px-[76px] py-8 md:py-16">
      {/* Desktop Layout */}
      <div className="hidden md:block max-w-[1288px] mx-auto">
        {/*
          CA1: Tablet (768–1023px) reduces inner padding from 60px → 28px so
          the sidebar + form don't overflow the container.
          CA4: lg:p-[60px] restores original desktop look exactly.
        */}
        <div className="bg-[#031634] rounded-[32px] p-7 lg:p-[60px] border border-[#031634]">
          <div className="flex gap-[28px]">
            {/* Left Sidebar — CA3: shrinks to w-[200px] at tablet, full width at desktop */}
            <div className="w-[200px] lg:w-[348px] bg-[#F1F0FB] rounded-[24px] border border-[#F1F2F9] p-4 lg:p-6 flex flex-col justify-between flex-shrink-0">
              <div>
                {/* Logo */}
                {/* CA2: shorter mb at tablet so logo doesn't push steps below fold */}
                <div className="mb-6 lg:mb-[100px] justify-center items-center mx-auto">
                  <img src={logoDesktop} alt="Demo Cleaning Co." className="h-12 mx-auto" />
                </div>

                {/* Steps */}
                <div className="space-y-0">
                  {steps.map((step, idx) => (
                    <div key={step.number} className="flex gap-4">
                      <div className="flex flex-col items-center">
                        <div
                          className={`w-[34px] h-[34px] rounded-[8px] flex items-center justify-center ${currentStep === step.number
                              ? 'bg-[#031634] border-[0.5px] border-[#A6A6A6]'
                              : currentStep > step.number
                                ? 'bg-[#031634] border-[0.5px] border-[#A6A6A6]'
                                : 'border border-gray-300 bg-white'
                            }`}
                        >
                          <span
                            className={`font-semibold text-sm ${currentStep >= step.number ? 'text-white' : 'text-[#031634]'
                              }`}
                          >
                            {step.number}
                          </span>
                        </div>
                        {idx < steps.length - 1 && (
                          <div className="w-[1px] h-[40px] bg-[#A6A6A6] my-3" />
                        )}
                      </div>
                      <div className="pb-6">
                        <h3 className="font-semibold text-sm text-[#031634] leading-[115%]">
                          {step.title}
                        </h3>
                        <p className="text-xs text-black opacity-60 leading-[150%] mt-1 font-['Quicksand']">
                          {step.description}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Need Help */}
              <div className="flex items-center justify-between pt-4">
                <div>
                  <p className="font-semibold text-sm text-[#031634] leading-[115%]">Need a help?</p>
                  <p className="text-xs text-black opacity-60 leading-[150%] font-['Quicksand']">
                    chat with live support
                  </p>
                </div>
                <a
                  href={WHATSAPP_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="w-[31px] h-[31px] rounded-[7px] border-[0.46px] border-[#F1F2F9] bg-gradient-to-b from-white to-[#F1F2F9] flex items-center justify-center"
                >
                  <img src={whatsappIcon} alt="WhatsApp" className="w-4 h-4" />
                </a>
              </div>
            </div>

            {/* Right Form Area */}
            <div className="flex-1 min-w-0">
              {/* Form Type Toggle */}
              <div className="flex flex-col items-center mb-6">
                <h3 className="font-bold text-sm text-white mb-4 leading-[115%]">Form Type</h3>
                <div className="flex gap-2 bg-[#010C1C] rounded-lg p-1">
                  <button
                    type="button"
                    onClick={() => handleFormTypeChange('general')}
                    className={`w-[178px] h-[28px] rounded-md text-[15px] font-semibold transition-all leading-[20px] ${formType === 'general'
                        ? 'bg-white text-[#031634]'
                        : 'bg-transparent text-white'
                      }`}
                  >
                    General Services
                  </button>
                  <button
                    type="button"
                    onClick={() => handleFormTypeChange('specialized')}
                    className={`w-[178px] h-[28px] rounded-md text-[15px] font-semibold transition-all leading-[20px] ${formType === 'specialized'
                        ? 'bg-white text-[#031634]'
                        : 'text-white'
                      }`}
                  >
                    Specialized Services
                  </button>
                </div>
              </div>

              {/* Form */}
              <div className="bg-white rounded-[24px] border border-[#CDB380] p-6 lg:p-12">
                {/* CA2: clamp title from 18px (tablet) to 24px (desktop) */}
                <h2
                  className="font-bold text-[#031634] mb-6 lg:mb-10 leading-[100%]"
                  style={{ fontSize: 'clamp(18px, 2vw, 24px)' }}
                >
                  {steps[currentStep - 1].title}
                </h2>

                {renderStepContent()}

                {error && (
                  <p className="text-sm text-red-600 mt-4">
                    {error}
                  </p>
                )}

                <div className="flex justify-between mt-8">
                  {currentStep > 1 && (
                    <button
                      onClick={handleBack}
                      className="bg-white text-[#031634] border border-[#031634] px-6 py-3 rounded-[24px] text-sm font-bold flex items-center gap-2 leading-[100%]"
                    >
                      <ChevronLeft size={16} />
                      Back
                    </button>
                  )}

                  {currentStep < 4 ? (
                    <button
                      onClick={handleNext}
                      className="bg-[#031634] text-white border border-[#031634] px-6 py-3 rounded-[24px] text-sm font-bold flex items-center gap-2 ml-auto leading-[100%]"
                    >
                      Continue
                      <ChevronRight size={16} />
                    </button>
                  ) : (
                    <button
                      onClick={handleSubmit}
                      disabled={loading}
                      className="bg-[#031634] text-white border border-[#031634] px-6 py-3 rounded-[24px] text-sm font-bold flex items-center gap-2 disabled:opacity-70 ml-auto leading-[100%]"
                    >
                      {loading ? 'Sending...' : 'Submit Booking'}
                      <ChevronRight size={16} />
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Mobile Layout */}
      <div className="md:hidden max-w-[363px] mx-auto mt-[-70px]">
        <div className="bg-[#F1F0FB] rounded-[28px] p-3">
          {/* Logo */}
          <div className="text-center mb-10">
            <img src={logoDesktop} alt="Demo Cleaning Co." className="h-12 w-auto mx-auto" />
          </div>

          {/* Form Type Toggle */}
          <div className="flex gap-2 bg-[#010C1C] rounded-[5px] p-[1.13px] mb-6">
            <button
              type="button"
              onClick={() => handleFormTypeChange('general')}
              className={`flex-1 py-2 rounded-[4px] text-[10px] font-semibold transition-all ${formType === 'general'
                  ? 'bg-white text-[#031634]'
                  : 'bg-transparent text-white'
                }`}
            >
              General Services
            </button>
            <button
              type="button"
              onClick={() => handleFormTypeChange('specialized')}
              className={`flex-1 py-2 rounded-[4px] text-[10px] font-semibold transition-all ${formType === 'specialized'
                  ? 'bg-white text-[#031634]'
                  : 'bg-transparent text-white'
                }`}
            >
              Specialized Services
            </button>
          </div>

          {/* Steps Row */}
          <div className="flex items-center justify-center gap-3 mb-6">
            {steps.map((step, idx) => (
              <div key={step.number} className="flex items-center">
                <div
                  className={`w-[24px] h-[24px] rounded-[5px] flex items-center justify-center ${currentStep === step.number
                      ? 'bg-[#031634]'
                      : currentStep > step.number
                        ? 'bg-[#031634]'
                        : 'border border-gray-300'
                    }`}
                >
                  <span
                    className={`font-semibold text-[10px] ${currentStep >= step.number ? 'text-white' : 'text-gray-400'
                      }`}
                  >
                    {step.number}
                  </span>
                </div>
                {idx < steps.length - 1 && (
                  <div className="w-[21px] h-[1px] bg-[#A6A6A6] mx-1" />
                )}
              </div>
            ))}
          </div>

          <h3 className="text-center font-bold text-[11.52px] text-[#031634] mb-4 leading-[115%]">
            {steps[currentStep - 1].title}
          </h3>

          {/* Form */}
          <div className="bg-[#D9D9D9] rounded-[28px] p-4 overflow-hidden">
            {currentStep === 1 && (
              <div className="space-y-4">
                <div>
                  <label htmlFor="fullNameMobile" className="block text-[11px] font-medium text-[#031634] mb-2 py-2">
                    Full name*
                  </label>
                  <input
                    id="fullNameMobile"
                    name="fullName"
                    type="text"
                    required
                    value={formData.fullName}
                    onChange={handleInputChange}
                    className="w-full min-h-[48px] border border-[#D9DBE9] rounded-[14px] px-4 py-2 text-[16px]"
                    placeholder="Eg. John Carter"
                  />
                </div>

                <div>
                  <label htmlFor="emailMobile" className="block text-[11px] font-medium text-[#031634] mb-2 py-2">
                    Email*
                  </label>
                  <input
                    id="emailMobile"
                    name="email"
                    type="email"
                    pattern="[^\s@]+@([^\s@]+\.)+[^\s@]+"
                    title="Please enter a valid email address"
                    required
                    value={formData.email}
                    onChange={handleInputChange}
                    className="w-full min-h-[48px] border border-[#D9DBE9] rounded-[14px] px-4 py-2 text-[16px]"
                    placeholder="Enter your email"
                  />
                </div>

                <div>
                  <label htmlFor="addressMobile" className="block text-[11px] font-medium text-[#031634] mb-2 py-2">
                    Address*
                  </label>
                  <input
                    id="addressMobile"
                    name="address"
                    type="text"
                    required
                    value={formData.address}
                    onChange={handleInputChange}
                    className="w-full min-h-[48px] border border-[#D9DBE9] rounded-[14px] px-4 py-2 text-[16px]"
                    placeholder="Eg. 1234 Douglas St, Victoria, BC"
                  />
                </div>

                <div>
                  <label htmlFor="phoneMobile" className="block text-[11px] font-medium text-[#031634] mb-2 py-2">
                    Phone number*
                  </label>
                  <input
                    id="phoneMobile"
                    name="phone"
                    type="tel"
                    required
                    value={formData.phone}
                    onChange={handleInputChange}
                    className="w-full min-h-[48px] border border-[#D9DBE9] rounded-[14px] px-4 py-2 text-[16px]"
                    placeholder="(250) 555-0123"
                  />
                </div>

                <div>
                  <label htmlFor="serviceOptionMobile" className="block text-[11px] font-medium text-[#031634] mb-2 py-2">
                    Type of service*
                  </label>
                  <select
                    id="serviceOptionMobile"
                    name="serviceOption"
                    required
                    value={formData.serviceOption}
                    onChange={handleInputChange}
                    className="w-full min-h-[48px] border border-[#D9DBE9] rounded-[14px] px-4 py-2 text-[16px]"
                  >
                    <option value="">Select a service</option>
                    {serviceOptions[formType].map((option) => (
                      <option key={option} value={option}>
                        {option}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            )}

            {currentStep === 2 && (
              <div className="space-y-4">
                <div>
                  <label htmlFor="cleaningFrequencyMobile" className="block text-[11px] font-medium text-[#031634] mb-2 py-2">
                    Cleaning Frequency*
                  </label>
                  <select
                    id="cleaningFrequencyMobile"
                    name="cleaningFrequency"
                    required
                    value={formData.cleaningFrequency}
                    onChange={handleInputChange}
                    className="w-full min-h-[48px] border border-[#D9DBE9] rounded-[14px] px-4 py-2 text-[16px]"
                  >
                    <option value="">Select frequency</option>
                    {cleaningFrequencies.map((option) => (
                      <option key={option} value={option}>
                        {option}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label htmlFor="propertySizeMobile" className="block text-[11px] font-medium text-[#031634] mb-2 py-2">
                    Property Size*
                  </label>
                  <select
                    id="propertySizeMobile"
                    name="propertySize"
                    required
                    value={formData.propertySize}
                    onChange={handleInputChange}
                    className="w-full min-h-[48px] border border-[#D9DBE9] rounded-[14px] px-4 py-2 text-[16px]"
                  >
                    <option value="">Select size</option>
                    {propertySizes.map((option) => (
                      <option key={option} value={option}>
                        {option}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label htmlFor="bedroomsMobile" className="block text-[11px] font-medium text-[#031634] mb-2 py-2">
                    Number of Bedrooms*
                  </label>
                  <select
                    id="bedroomsMobile"
                    name="bedrooms"
                    required
                    value={formData.bedrooms}
                    onChange={handleInputChange}
                    className="w-full min-h-[48px] border border-[#D9DBE9] rounded-[14px] px-4 py-2 text-[16px]"
                  >
                    <option value="">Select bedrooms</option>
                    {bedroomOptions.map((option) => (
                      <option key={option} value={option}>
                        {option}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label htmlFor="fullBathroomsMobile" className="block text-[11px] font-medium text-[#031634] mb-2 py-2">
                    Number of Full Bathrooms*
                  </label>
                  <select
                    id="fullBathroomsMobile"
                    name="fullBathrooms"
                    required
                    value={formData.fullBathrooms}
                    onChange={handleInputChange}
                    className="w-full min-h-[48px] border border-[#D9DBE9] rounded-[14px] px-4 py-2 text-[16px]"
                  >
                    <option value="">Select bathrooms</option>
                    {bathroomOptions.map((option) => (
                      <option key={option} value={option}>
                        {option}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label htmlFor="halfBathroomsMobile" className="block text-[11px] font-medium text-[#031634] mb-2 py-2">
                    Number of Half Bathrooms*
                  </label>
                  <select
                    id="halfBathroomsMobile"
                    name="halfBathrooms"
                    required
                    value={formData.halfBathrooms}
                    onChange={handleInputChange}
                    className="w-full min-h-[48px] border border-[#D9DBE9] rounded-[14px] px-4 py-2 text-[16px]"
                  >
                    <option value="">Select half bathrooms</option>
                    {halfBathroomOptions.map((option) => (
                      <option key={option} value={option}>
                        {option}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            )}

            {currentStep === 3 && (
              <div className="space-y-4">
                <div>
                  <label htmlFor="petsMobile" className="block text-[11px] font-medium text-[#031634] mb-2 py-2">
                    Pets*
                  </label>
                  <select
                    id="petsMobile"
                    name="pets"
                    required
                    value={formData.pets}
                    onChange={handleInputChange}
                    className="w-full min-h-[48px] border border-[#D9DBE9] rounded-[14px] px-4 py-2 text-[16px]"
                  >
                    <option value="">Select option</option>
                    {yesNoOptions.map((option) => (
                      <option key={option} value={option}>
                        {option}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label htmlFor="insideFridgeMobile" className="block text-[11px] font-medium text-[#031634] mb-2 py-2">
                    Inside the Fridge*
                  </label>
                  <select
                    id="insideFridgeMobile"
                    name="insideFridge"
                    required
                    value={formData.insideFridge}
                    onChange={handleInputChange}
                    className="w-full min-h-[48px] border border-[#D9DBE9] rounded-[14px] px-4 py-2 text-[16px]"
                  >
                    <option value="">Select option</option>
                    {yesNoOptions.map((option) => (
                      <option key={option} value={option}>
                        {option}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label htmlFor="insideFreezerMobile" className="block text-[11px] font-medium text-[#031634] mb-2 py-2">
                    Inside the Freezer*
                  </label>
                  <select
                    id="insideFreezerMobile"
                    name="insideFreezer"
                    required
                    value={formData.insideFreezer}
                    onChange={handleInputChange}
                    className="w-full min-h-[48px] border border-[#D9DBE9] rounded-[14px] px-4 py-2 text-[16px]"
                  >
                    <option value="">Select option</option>
                    {yesNoOptions.map((option) => (
                      <option key={option} value={option}>
                        {option}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label htmlFor="insideOvenMobile" className="block text-[11px] font-medium text-[#031634] mb-2 py-2">
                    Inside the Oven*
                  </label>
                  <select
                    id="insideOvenMobile"
                    name="insideOven"
                    required
                    value={formData.insideOven}
                    onChange={handleInputChange}
                    className="w-full min-h-[48px] border border-[#D9DBE9] rounded-[14px] px-4 py-2 text-[16px]"
                  >
                    <option value="">Select option</option>
                    {yesNoOptions.map((option) => (
                      <option key={option} value={option}>
                        {option}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label htmlFor="insideWindowsMobile" className="block text-[11px] font-medium text-[#031634] mb-2 py-2">
                    Inside Windows*
                  </label>
                  <select
                    id="insideWindowsMobile"
                    name="insideWindows"
                    required
                    value={formData.insideWindows}
                    onChange={handleInputChange}
                    className="w-full min-h-[48px] border border-[#D9DBE9] rounded-[14px] px-4 py-2 text-[16px]"
                  >
                    <option value="">Select number of windows</option>
                    {windowOptions.map((option) => (
                      <option key={option} value={option}>
                        {option}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            )}

            {currentStep === 4 && (
              <div className="space-y-4">
                <div>
                  <label htmlFor="deepCleanedMobile" className="block text-[11px] font-medium text-[#031634] mb-2 py-2">
                    Deep cleaned in last 30 days*
                  </label>
                  <select
                    id="deepCleanedMobile"
                    name="deepCleaned"
                    required
                    value={formData.deepCleaned}
                    onChange={handleInputChange}
                    className={fieldClass('deepCleaned', 'w-full min-h-[48px] border border-[#D9DBE9] rounded-[14px] px-4 py-2 text-[16px]')}
                  >
                    <option value="">Select option</option>
                    {yesNoOptions.map((option) => (
                      <option key={option} value={option}>
                        {option}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label htmlFor="closeToHiringMobile" className="block text-[11px] font-medium text-[#031634] mb-2 py-2">
                    Close to hiring us*
                  </label>
                  <select
                    id="closeToHiringMobile"
                    name="closeToHiring"
                    required
                    value={formData.closeToHiring}
                    onChange={handleInputChange}
                    className={fieldClass('closeToHiring', 'w-full min-h-[48px] border border-[#D9DBE9] rounded-[14px] px-4 py-2 text-[16px]')}
                  >
                    <option value="">Select your status</option>
                    {hiringOptions.map((option) => (
                      <option key={option} value={option}>
                        {option}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Date Selector for Mobile */}
                <div>
                  <label htmlFor="cleaningDateMobile" className="block text-[11px] font-medium text-[#031634] mb-2 py-2">
                    Choose Your Ideal Cleaning Day!*
                  </label>
                  <input
                    id="cleaningDateMobile"
                    name="cleaningDate"
                    type="date"
                    required
                    min={getTodayString()}
                    value={formData.cleaningDate}
                    onChange={handleInputChange}
                    className={fieldClass('cleaningDate', 'w-full max-w-full min-h-[48px] border border-[#D9DBE9] rounded-[14px] px-4 py-2 text-[16px] box-border')}
                    placeholder="Select a tentative day for sparkle"
                  />
                </div>

                {/* Preferred Days for Mobile */}
                <div>
                  <label className="block text-[11px] font-medium text-[#031634] mb-2 py-2">
                    Preferred days <span className="text-[#6F6C8F] font-normal">(optional)</span>
                  </label>
                  <div className="border border-[#D9DBE9] rounded-[14px] px-4 py-3 grid grid-cols-2 gap-y-3 gap-x-4">
                    {daysOfWeek.map((day) => (
                      <label key={day} className="flex items-center gap-2 cursor-pointer text-[14px] text-[#031634]">
                        <input
                          type="checkbox"
                          checked={(formData.preferredDays as string[]).includes(day)}
                          onChange={(e) => handleCheckboxChange('preferredDays', day, e.target.checked)}
                          className="w-4 h-4 accent-[#031634] cursor-pointer"
                        />
                        {day}
                      </label>
                    ))}
                  </div>
                </div>

                {/* Preferred Time for Mobile — multi-select checkboxes */}
                <div>
                  <label className="block text-[11px] font-medium text-[#031634] mb-2 py-2">
                    Preferred time <span className="text-[#6F6C8F] font-normal">(optional)</span>
                  </label>
                  <div className="border border-[#D9DBE9] rounded-[14px] px-4 py-3 space-y-3">
                    {preferredTimeOptions.map((opt) => (
                      <label key={opt.value} className="flex items-center gap-2 cursor-pointer text-[14px] text-[#031634]">
                        <input
                          type="checkbox"
                          checked={(formData.preferredTime as string[]).includes(opt.value)}
                          onChange={(e) => handleCheckboxChange('preferredTime', opt.value, e.target.checked)}
                          className="w-4 h-4 accent-[#031634] cursor-pointer"
                        />
                        {opt.label}
                      </label>
                    ))}
                  </div>
                </div>

                {/* Additional Message Field for Mobile */}
                <div>
                  <label htmlFor="additionalMessageMobile" className="block text-[11px] font-medium text-[#031634] mb-2 py-2">
                    Additional message
                  </label>
                  <textarea
                    id="additionalMessageMobile"
                    name="additionalMessage"
                    value={formData.additionalMessage}
                    onChange={handleInputChange}
                    className="w-full min-h-[80px] border border-[#D9DBE9] rounded-[14px] px-4 py-3 text-[16px] resize-y"
                    placeholder="Any special instructions or additional information..."
                  />
                </div>
              </div>
            )}

            {error && (
              <p className="text-xs text-red-600 mt-4">
                {error}
              </p>
            )}

            <div className="flex justify-between items-center mt-6">
              {currentStep > 1 && (
                <button
                  onClick={handleBack}
                  className="bg-white text-[#031634] border border-[#031634] px-4 py-3 rounded-[9px] text-[10px] font-semibold flex items-center gap-2 leading-[100%]"
                >
                  <ChevronLeft size={10} />
                  Back
                </button>
              )}

              {currentStep < 4 ? (
                <button
                  onClick={handleNext}
                  className="bg-[#031634] text-white px-4 py-3 rounded-[9px] text-[10px] font-semibold flex items-center gap-2 ml-auto leading-[100%]"
                >
                  Continue
                  <ChevronRight size={10} />
                </button>
              ) : (
                <button
                  onClick={handleSubmit}
                  disabled={loading}
                  className="bg-[#031634] text-white px-4 py-3 rounded-[9px] text-[10px] font-semibold flex items-center gap-2 disabled:opacity-70 ml-auto leading-[100%]"
                >
                  {loading ? 'Sending...' : 'Submit'}
                  <ChevronRight size={10} />
                </button>
              )}
            </div>

            {/* Need Help */}
            <div className="flex items-center justify-between mt-6 px-2 pt-4">
              <div>
                <p className="font-semibold text-[14.68px] text-[#031634] leading-[115%]">Need a help?</p>
                <p className="text-[11px] text-[#6F6C8F] leading-[150%] font-['Quicksand']">
                  chat with live support
                </p>
              </div>
              <a
                href={WHATSAPP_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="w-[31px] h-[31px] rounded-[7px] border-[0.46px] border-[#F1F2F9] bg-gradient-to-b from-white to-[#F1F2F9] flex items-center justify-center"
              >
                <img src={whatsappIcon} alt="WhatsApp" className="w-4 h-4" />
              </a>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}