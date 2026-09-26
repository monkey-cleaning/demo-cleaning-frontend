import { Link } from 'react-router-dom';
import { blogAdminCopy as copy } from '../../copy/blogSettings';

/** Content-only screen; parent should provide AdminNavbar + page shell. */
export default function BlogDisabledScreen() {
  return (
    <div className="flex items-center justify-center px-4 py-16">
      <div className="max-w-md w-full bg-white rounded-2xl border border-gray-100 shadow-sm p-8 text-center space-y-4">
        <h1 className="text-xl font-montserrat font-bold text-[#031634]">
          {copy.disabledTitle}
        </h1>
        <p className="text-sm text-gray-500 leading-relaxed">{copy.disabledBody}</p>
        <Link
          to="/admin/settings"
          className="inline-flex items-center justify-center px-4 py-2.5 rounded-lg bg-[#031634] text-white text-sm font-semibold hover:bg-[#031634]/90 transition-colors"
        >
          {copy.disabledCta}
        </Link>
      </div>
    </div>
  );
}
