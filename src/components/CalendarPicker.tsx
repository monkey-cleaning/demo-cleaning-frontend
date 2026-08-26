import { useState, useMemo } from 'react';
import { format, startOfMonth, endOfMonth, eachDayOfInterval, isSameDay, isSameMonth, addMonths, subMonths, startOfWeek, endOfWeek } from 'date-fns';

type CalendarPickerProps = {
  availableDates: Date[];
  selectedDate: Date | null;
  onSelectDate: (date: Date) => void;
};

export default function CalendarPicker({ availableDates, selectedDate, onSelectDate }: CalendarPickerProps) {
  const [currentMonth, setCurrentMonth] = useState(new Date());

  const monthStart = startOfMonth(currentMonth);
  const monthEnd = endOfMonth(currentMonth);
  const calendarStart = startOfWeek(monthStart);
  const calendarEnd = endOfWeek(monthEnd);

  const days = eachDayOfInterval({ start: calendarStart, end: calendarEnd });

  const availableDatesSet = useMemo(() => {
    return new Set(availableDates.map(d => d.toDateString()));
  }, [availableDates]);

  function isDateAvailable(date: Date) {
    return availableDatesSet.has(date.toDateString());
  }

  function isDateSelected(date: Date) {
    if (!selectedDate) return false;
    return isSameDay(date, selectedDate);
  }

  function handlePrevMonth() {
    setCurrentMonth(subMonths(currentMonth, 1));
  }

  function handleNextMonth() {
    setCurrentMonth(addMonths(currentMonth, 1));
  }

  function handleDayClick(date: Date) {
    if (isDateAvailable(date)) {
      onSelectDate(date);
    }
  }

  return (
    <div className="bg-white rounded-xl border border-slate-200 p-6">
      {/* Header con navegación de mes */}
      <div className="flex items-center justify-between mb-6">
        <button
          onClick={handlePrevMonth}
          className="p-2 rounded-lg hover:bg-slate-100 text-slate-600"
          aria-label="Previous month"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </button>

        <h2 className="text-lg font-semibold text-slate-900">
          {format(currentMonth, 'MMMM yyyy')}
        </h2>

        <button
          onClick={handleNextMonth}
          className="p-2 rounded-lg hover:bg-slate-100 text-slate-600"
          aria-label="Next month"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
        </button>
      </div>

      {/* Nombres de días de la semana */}
      <div className="grid grid-cols-7 gap-1 mb-2">
        {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(day => (
          <div key={day} className="text-center text-xs font-medium text-slate-500 py-2">
            {day}
          </div>
        ))}
      </div>

      {/* Grid de días */}
      <div className="grid grid-cols-7 gap-1">
        {days.map((day) => {
          const isCurrentMonth = isSameMonth(day, currentMonth);
          const isAvailable = isDateAvailable(day);
          const isSelected = isDateSelected(day);
          const isToday = isSameDay(day, new Date());

          return (
            <button
              key={day.toISOString()}
              onClick={() => handleDayClick(day)}
              disabled={!isAvailable}
              className={`
                aspect-square p-2 rounded-lg text-sm font-medium transition-colors
                ${!isCurrentMonth ? 'text-slate-300' : ''}
                ${isAvailable && isCurrentMonth ? 'hover:bg-slate-100 cursor-pointer' : ''}
                ${!isAvailable && isCurrentMonth ? 'text-slate-400 cursor-not-allowed' : ''}
                ${isSelected ? 'bg-slate-900 text-white hover:bg-slate-800' : ''}
                ${isToday && !isSelected ? 'ring-2 ring-slate-900 ring-inset' : ''}
                ${isAvailable && !isSelected && isCurrentMonth ? 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100' : ''}
              `}
            >
              {format(day, 'd')}
            </button>
          );
        })}
      </div>

      {/* Leyenda */}
      <div className="mt-6 flex items-center gap-4 text-xs text-slate-600">
        <div className="flex items-center gap-2">
          <div className="w-4 h-4 rounded bg-emerald-50 border border-emerald-200"></div>
          <span>Available</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-4 h-4 rounded bg-slate-900"></div>
          <span>Selected</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-4 h-4 rounded ring-2 ring-slate-900 ring-inset"></div>
          <span>Today</span>
        </div>
      </div>
    </div>
  );
}