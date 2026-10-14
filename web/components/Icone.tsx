import {
  BadgeCheck, BellRing, Boxes, CalendarClock, CalendarCog, CalendarDays, CalendarRange, CircleCheckBig, ClipboardList,
  Factory, FolderOpen, HardHat, HeartPulse, Home, LayoutDashboard, ListChecks, Microscope, Radar, Receipt, Search,
  ShieldCheck, SlidersHorizontal, UserRound, UsersRound, Wallet, Wrench, type LucideProps,
} from "lucide-react";

const MAPA = {
  BadgeCheck, BellRing, Boxes, CalendarClock, CalendarCog, CalendarDays, CalendarRange, CircleCheckBig, ClipboardList,
  Factory, FolderOpen, HardHat, HeartPulse, Home, LayoutDashboard, ListChecks, Microscope, Radar, Receipt, Search,
  ShieldCheck, SlidersHorizontal, UserRound, UsersRound, Wallet, Wrench,
};

export function Icone({ nome, ...p }: { nome: string } & LucideProps) {
  const C = MAPA[nome as keyof typeof MAPA] ?? LayoutDashboard;
  return <C {...p} />;
}
