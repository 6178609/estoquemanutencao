import {
  BadgeCheck, BellRing, Boxes, BookOpen, CalendarClock, CalendarCog, CalendarDays, CalendarRange, CircleCheckBig, ClipboardList, CreditCard,
  Factory, FolderOpen, Gauge, GraduationCap, HardHat, HeartPulse, Home, LayoutDashboard, LifeBuoy, ListChecks, Microscope, Radar, Receipt, Search,
  ShieldCheck, SlidersHorizontal, Timer, UserRound, UsersRound, Wallet, Wrench, type LucideProps,
} from "lucide-react";

const MAPA = {
  BadgeCheck, BellRing, Boxes, BookOpen, CalendarClock, CalendarCog, CalendarDays, CalendarRange, CircleCheckBig, ClipboardList, CreditCard,
  Factory, FolderOpen, Gauge, GraduationCap, HardHat, HeartPulse, Home, LayoutDashboard, LifeBuoy, ListChecks, Microscope, Radar, Receipt, Search,
  ShieldCheck, SlidersHorizontal, Timer, UserRound, UsersRound, Wallet, Wrench,
};

export function Icone({ nome, ...p }: { nome: string } & LucideProps) {
  const C = MAPA[nome as keyof typeof MAPA] ?? LayoutDashboard;
  return <C {...p} />;
}
