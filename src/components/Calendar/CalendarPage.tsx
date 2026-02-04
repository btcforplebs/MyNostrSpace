import { useState, useEffect, useMemo } from 'react';
import { useNostr } from '../../context/NostrContext';
import { Navbar } from '../Shared/Navbar';
import { type NDKFilter, NDKEvent } from '@nostr-dev-kit/ndk';
import { RichTextRenderer } from '../Shared/RichTextRenderer';
import './CalendarPage.css';

export const CalendarPage = () => {
  const { ndk, user } = useNostr();
  const [currentDate, setCurrentDate] = useState(new Date());
  const [events, setEvents] = useState<NDKEvent[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedDay, setSelectedDay] = useState<Date | null>(null);

  // Helper to get start and end of current month view
  const { calendarStart, calendarEnd } = useMemo(() => {
    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();

    const monthStart = new Date(year, month, 1);
    const monthEnd = new Date(year, month + 1, 0);

    // Start from the Sunday before the 1st
    const calendarStart = new Date(monthStart);
    calendarStart.setDate(1 - calendarStart.getDay());

    // End at the Saturday after the last day
    const calendarEnd = new Date(monthEnd);
    calendarEnd.setDate(monthEnd.getDate() + (6 - monthEnd.getDay()));

    return { calendarStart, calendarEnd };
  }, [currentDate]);

  useEffect(() => {
    if (!ndk || !user) return;

    const fetchMonthEvents = async () => {
      setLoading(true);
      try {
        // Fetch events for the visible range (plus a buffer maybe)
        // Convert dates to unix timestamp
        const since = Math.floor(calendarStart.getTime() / 1000);
        const until = Math.floor(calendarEnd.getTime() / 1000) + 86400; // End of last day

        const filter: NDKFilter = {
          kinds: [1, 30023],
          authors: [user.pubkey],
          since,
          until,
          limit: 1000,
        };

        const fetchedEvents = await ndk.fetchEvents(filter);
        setEvents(Array.from(fetchedEvents));
      } catch (e) {
        console.error('Failed to fetch calendar events', e);
      } finally {
        setLoading(false);
      }
    };

    fetchMonthEvents();
  }, [ndk, user, calendarStart, calendarEnd]);

  // Group events by day string using local date to match user's perspective
  const eventsByDay = useMemo(() => {
    const map = new Map<string, NDKEvent[]>();
    events.forEach((event) => {
      if (!event.created_at) return;
      const date = new Date(event.created_at * 1000);
      // Use YYYY-MM-DD in LOCAL time
      const year = date.getFullYear();
      const month = String(date.getMonth() + 1).padStart(2, '0');
      const day = String(date.getDate()).padStart(2, '0');
      const key = `${year}-${month}-${day}`;

      if (!map.has(key)) map.set(key, []);
      map.get(key)?.push(event);
    });

    // Sort events within each day
    map.forEach((dayEvents) => {
      dayEvents.sort((a, b) => (a.created_at || 0) - (b.created_at || 0));
    });

    return map;
  }, [events]);

  const changeMonth = (delta: number) => {
    setCurrentDate((prev) => new Date(prev.getFullYear(), prev.getMonth() + delta, 1));
    setSelectedDay(null);
  };

  const handleDayClick = (day: Date) => {
    setSelectedDay(day);
  };

  const renderCalendarGrid = () => {
    if (loading) {
      return (
        <div style={{ gridColumn: 'span 7', padding: '40px', textAlign: 'center' }}>
          Loading events...
        </div>
      );
    }

    const days = [];
    const day = new Date(calendarStart);

    while (day <= calendarEnd) {
      const isCurrentMonth = day.getMonth() === currentDate.getMonth();
      const isToday = new Date().toDateString() === day.toDateString();

      const year = day.getFullYear();
      const month = String(day.getMonth() + 1).padStart(2, '0');
      const dateVal = String(day.getDate()).padStart(2, '0');
      const dayKey = `${year}-${month}-${dateVal}`;

      const dayEvents = eventsByDay.get(dayKey) || [];
      const isSelected = selectedDay && day.toDateString() === selectedDay.toDateString();

      // Capture the date value for the closure
      const clickDate = new Date(day);

      days.push(
        <div
          key={dayKey}
          className={`calendar-day-cell ${!isCurrentMonth ? 'other-month' : ''} ${isToday ? 'today' : ''} ${dayEvents.length > 0 ? 'has-posts' : ''} ${isSelected ? 'selected' : ''}`}
          onClick={() => handleDayClick(clickDate)}
          style={isSelected ? { border: '2px solid #003399' } : {}}
        >
          <div className="day-number">{day.getDate()}</div>
          <div className="day-dots">
            {dayEvents.slice(0, 3).map((ev) => (
              <div key={ev.id} className="post-preview-item">
                {ev.content.slice(0, 15)}...
              </div>
            ))}
            {dayEvents.length > 3 && (
              <div style={{ fontSize: '8px', color: '#666' }}>+{dayEvents.length - 3} more</div>
            )}
          </div>
        </div>
      );

      day.setDate(day.getDate() + 1);
    }
    return days;
  };

  const renderSelectedDay = () => {
    if (!selectedDay) return null;

    const year = selectedDay.getFullYear();
    const monthString = String(selectedDay.getMonth() + 1).padStart(2, '0');
    const dateVal = String(selectedDay.getDate()).padStart(2, '0');
    const dayKey = `${year}-${monthString}-${dateVal}`;

    const dayEvents = eventsByDay.get(dayKey) || [];

    return (
      <div className="selected-day-view">
        <h3>Posts on {selectedDay.toLocaleDateString()}</h3>
        {dayEvents.length === 0 ? (
          <p>No posts on this day.</p>
        ) : (
          <div className="calendar-post-list">
            {dayEvents.map((ev) => (
              <div key={ev.id} className="calendar-post-card">
                <div className="calendar-post-time">
                  {new Date((ev.created_at || 0) * 1000).toLocaleTimeString([], {
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </div>
                <div className="calendar-post-content">
                  <RichTextRenderer content={ev.content} />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="calendar-page-wrapper">
      <div style={{ maxWidth: '992px', margin: '0 auto', width: '100%' }}>
        <Navbar />
      </div>

      <div className="calendar-container">
        <div className="calendar-header-controls">
          <button className="calendar-nav-btn" onClick={() => changeMonth(-1)}>
            &lt; Prev
          </button>
          <h2>{currentDate.toLocaleDateString('default', { month: 'long', year: 'numeric' })}</h2>
          <button className="calendar-nav-btn" onClick={() => changeMonth(1)}>
            Next &gt;
          </button>
        </div>

        <div className="calendar-grid">
          {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((d) => (
            <div key={d} className="calendar-day-header">
              {d}
            </div>
          ))}
          {renderCalendarGrid()}
        </div>

        {renderSelectedDay()}
      </div>
    </div>
  );
};
