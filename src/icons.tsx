import type { LucideIcon } from 'lucide-react';
import {
  Bell, BookOpen, Bookmark, Bot, BriefcaseBusiness, CalendarDays,
  Cloud, CodeXml, Columns3, Compass, Cpu, FileText, Figma,
  Folder, Github, Globe2, House, LayoutDashboard, Layers3,
  Link2, ListTodo, Mail, MessageCircle, MessagesSquare,
  Monitor, NotebookPen, PanelTop, Plus, Rocket, Search,
  Save, Settings2, Sparkles, Terminal, Wrench
} from 'lucide-react';

/** Stored icon keys stay stable so existing Kreis shortcuts keep their appearance. */
export const icons: Record<string, LucideIcon> = {
  bell: Bell,
  book: BookOpen,
  bookmark: Bookmark,
  bot: Bot,
  briefcase: BriefcaseBusiness,
  calendar: CalendarDays,
  cloud: Cloud,
  code: CodeXml,
  columns: Columns3,
  compass: Compass,
  cpu: Cpu,
  document: FileText,
  figma: Figma,
  folder: Folder,
  github: Github,
  globe: Globe2,
  home: House,
  dashboard: LayoutDashboard,
  layers: Layers3,
  link: Link2,
  tasks: ListTodo,
  mail: Mail,
  message: MessageCircle,
  messages: MessagesSquare,
  monitor: Monitor,
  notebook: NotebookPen,
  panel: PanelTop,
  plus: Plus,
  rocket: Rocket,
  search: Search,
  save: Save,
  settings: Settings2,
  sparkles: Sparkles,
  terminal: Terminal,
  wrench: Wrench
};
