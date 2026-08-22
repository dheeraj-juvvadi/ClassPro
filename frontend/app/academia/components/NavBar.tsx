'use client';

import Link from 'next/link';
import React, { useEffect, useState } from 'react';
import { AiOutlineClockCircle } from "react-icons/ai";
import { FiPercent } from "react-icons/fi";
import { BsFillPersonCheckFill } from "react-icons/bs";
import { motion, LayoutGroup } from "motion/react";

export default function NavBar() {
    const [currentView, setCurrentView] = useState('timetable');
    const views = [
        { id: 'timetable', label: <AiOutlineClockCircle /> },
        { id: 'attendance', label: <BsFillPersonCheckFill /> },
        { id: 'marks', label: <FiPercent /> }
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
        <motion.nav
            className="sticky bottom-2 z-50 w-full flex items-center justify-center"
            initial={{ y: 20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ delay: 0.5, duration: 0.4 }}
        >
            <LayoutGroup>
                <div className="flex items-center justify-center p-1 rounded-full bg-light-background-light dark:bg-dark-background-darker gap-2">
                    {views.map((view) => (
                        <Link
                            href={`#${view.id}`}
                            onClick={() => {
                                setCurrentView(view.id);
                            }}
                            key={view.id}
                            className={`relative px-3 py-2 text-2xl rounded-full font-semibold transition-colors duration-150 ${currentView === view.id ? 'text-light-background-light dark:text-dark-background-dark' : 'hover:bg-light-background-normal dark:hover:bg-dark-background-normal'}`}
                        >
                            {currentView === view.id && (
                                <motion.span
                                    layoutId="nav-pill"
                                    className="absolute inset-0 rounded-full bg-light-accent dark:bg-dark-accent"
                                    transition={{ type: "spring", stiffness: 500, damping: 35 }}
                                />
                            )}
                            <span className="relative z-10">{view.label}</span>
                        </Link>
                    ))}
                </div>
            </LayoutGroup>
        </motion.nav>
    );
}
