'use client';
import {createContext,useContext} from 'react';
const NavigationAccess=createContext<readonly string[]>([]);
export function AdminNavigationAccess({hrefs,children}:{hrefs:string[];children:React.ReactNode}){return <NavigationAccess.Provider value={hrefs}>{children}</NavigationAccess.Provider>;}
export function useAdminNavigationAccess(){return useContext(NavigationAccess);}
