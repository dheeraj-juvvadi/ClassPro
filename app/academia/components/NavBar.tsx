'use client';

import Link from 'next/link';
import React, { useEffect, useState } from 'react';
import { AiOutlineClockCircle } from "react-icons/ai";
import { FiPercent } from "react-icons/fi";
import { BsFillPersonCheckFill } from "react-icons/bs";

export default function NavBar() {
    const [currentView, setCurrentView] = useState('timetable');
    const views = [
        { id: 'timetable', name: 'Timetable', icon: <AiOutlineClockCircle /> },
        { id: 'attendance', name: 'Attendance', icon: <BsFillPersonCheckFill /> },
        { id: 'marks', name: 'Marks', icon: <FiPercent /> }
    ];

    useEffect(() => {
        const getCurrentView = () => {
            return window.location.hash.slice(1) || 'timetable';
        };

        setCurrentView(getCurrentView());

        const handleHashChange = () => {
            setCurrentView(getCurrentView());
        };

        window.addEventListener('hashchange', handleHashChange);
        return () => window.removeEventListener('hashchange', handleHashChange);
    }, []);

    

    return (
        <nav className="sticky bottom-2 z-50 w-full flex items-center justify-center">
            <div className="flex items-center justify-center p-1 rounded-full bg-light-background-light dark:bg-dark-background-darker gap-2">
                {views.map((view) => (
                    <a
                        href={`#${view.id}`}
                        aria-current={currentView === view.id ? 'true' : undefined}
                        aria-label={view.name}
                        onClick={() => {
                            setCurrentView(view.id);
                        }}
                        key={view.id}
                        className={`min-h-11 min-w-11 px-4 py-2 text-2xl rounded-full font-semibold transition-all duration-150 ${currentView === view.id ? 'bg-light-accent dark:bg-dark-accent text-light-background-light dark:text-dark-background-dark' : 'hover:bg-light-background-normal dark:hover:bg-dark-background-normal'}`}
                    >
                        {view.icon}
                    </a>
                ))}
            </div>
        </nav>
    );
}
