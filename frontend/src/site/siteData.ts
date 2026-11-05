// ─────────────────────────────────────────────────────────────────────────────
// ✏️  EDIT THIS FILE to change what the public website says. No other code needs touching.
//     The lists below are SAMPLE text – replace them with your school's real labs, rooms and facts.
//     Photos are NOT stored here: upload them in Admin → Photo gallery.
// ─────────────────────────────────────────────────────────────────────────────
import { Atom, BookOpen, Dumbbell, FlaskConical, Laptop, Library, Mic, Stethoscope, Users, School, Trophy, Music } from 'lucide-react';

export const SITE = {
  name: "St. Xavier's High School",
  town: 'Padrauna, Kushinagar',
  motto: 'Discipline & Justice',
  tagline: 'Nursery to Class 12',
  established: '',            // e.g. '1995' – shown only when filled in
  // Social links. Leave '' to hide the button. Example: 'https://instagram.com/yourschool'
  social: { instagram: '', facebook: '', youtube: '' },
  principalNote: 'We help every child grow in knowledge, character and fairness — the values on our crest.',
  about: [
    "St. Xavier's High School is a school in Padrauna, Kushinagar, teaching children from Nursery to Class 12.",
    'Our crest carries the scales of justice over an open book and our motto, Discipline & Justice. Everything we do — in class, on the field and on the school bus — is built around those two ideas.',
  ],
};

export const LABS = [
  { icon: Atom, name: 'Physics Laboratory', text: 'Hands-on experiments for senior classes, with a lab period every week.' },
  { icon: FlaskConical, name: 'Chemistry Laboratory', text: 'Supervised practicals covering the full board syllabus.' },
  { icon: Stethoscope, name: 'Biology Laboratory', text: 'Specimens, models and microscopes for practical learning.' },
  { icon: Laptop, name: 'Computer Laboratory', text: 'Computer classes from the primary section onward.' },
];

export const ROOMS = [
  { icon: School, name: 'Classrooms', text: 'Bright, well-ventilated classrooms for every section.' },
  { icon: Library, name: 'Library & Reading Room', text: 'A quiet space with textbooks, reference books and story books.' },
  { icon: Mic, name: 'Assembly Hall', text: 'Used for morning assembly, annual day and school programmes.' },
  { icon: Dumbbell, name: 'Playground', text: 'Open grounds for sports, drill and physical education.' },
  { icon: Music, name: 'Activity Room', text: 'Music, art and craft activities.' },
  { icon: Users, name: 'Staff Room', text: 'Where teachers plan, mark and meet parents.' },
  { icon: BookOpen, name: 'Examination Hall', text: 'Seating arranged for half-yearly and annual exams.' },
  { icon: Trophy, name: 'Sports Room', text: 'Equipment for cricket, football, athletics and indoor games.' },
];
