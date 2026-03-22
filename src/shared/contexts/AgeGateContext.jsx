import { createContext, useCallback, useContext, useMemo, useState, useEffect } from 'react';

const AgeGateContext = createContext();

export function AgeGateProvider({ children }) {
  const [showAdult, setShowAdult] = useState(() => {
    return localStorage.getItem('moodtoon-show-adult') === 'true';
  });

  useEffect(() => {
    localStorage.setItem('moodtoon-show-adult', String(showAdult));
    document.documentElement.setAttribute('data-show-adult', String(showAdult));
  }, [showAdult]);

  const toggleAdult = useCallback(() => setShowAdult((prev) => !prev), []);

  const value = useMemo(() => ({ showAdult, toggleAdult }), [showAdult, toggleAdult]);

  return (
    <AgeGateContext.Provider value={value}>
      {children}
    </AgeGateContext.Provider>
  );
}

// eslint-disable-next-line react-refresh/only-export-components
export const useAgeGate = () => useContext(AgeGateContext);
