// English names for the catalog. eCampus keeps most module and course titles in German even in
// its English UI, so these are our own translations. Unknown titles fall back to German and are
// reported by the scraper so this file can be extended.

import FB16 from './translations-fb16.json' with { type: 'json' };
// The other faculties (drafted with Grok and reviewed by a second Grok pass), same shape plus program names.
import UNI from './translations-uni.json' with { type: 'json' };

// Requirements to complete by the end of the master. English names are the official ones in eCampus.
// group "area": one module from this area (matched by area path).
// group "module": a fixed module that must be taken (matched by module title).
export const CATEGORIES = [
  { id: 'Vertiefung in Mathematik/Elektrotechnik', group: 'area', name: 'Advanced studies in mathematics/electrical engineering', short: 'Math/EE' },
  { id: 'Theoretische Informatik', group: 'area', name: 'Theoretical Computer Science', short: 'Theoretical CS' },
  { id: 'Technische Informatik', group: 'area', name: 'Technical Computer Science', short: 'Technical CS' },
  { id: 'Praktische Informatik', group: 'area', name: 'Practical Computer Science', short: 'Practical CS' },
  { id: 'Projekt', group: 'module', name: 'Project', short: 'Project' },
  { id: 'Seminar', group: 'module', name: 'Seminar', short: 'Seminar' },
  { id: 'Schlüsselkompetenzen', group: 'module', name: 'Key competencies', short: 'Key competencies' },
];

// Modules whose courses are alternatives (pick one): adding the module selects no course by default.
export const PICK_ONE_MODULES = [
  'Projekt',
  'Seminar',
  'Schlüsselkompetenzen',
  'Seminare technische/praktische Informatik',
  'Seminare theoretische Informatik/Mathematik',
  'Vertiefung Mathematik',
];

// Area paths (German, as in eCampus) whose modules also count for a category.
// Category by module-handbook code prefix. Used only for courses eCampus has not attached to any
// module (e.g. Advanced Machine Learning Techniques, TeI-01): the handbook is then the only placement.
export const CODE_CATEGORIES = {
  PI: 'Praktische Informatik',
  TeI: 'Technische Informatik',
  TI: 'Theoretische Informatik',
  'M/E': 'Vertiefung in Mathematik/Elektrotechnik',
};

export const CATEGORY_ALIASES = {
  'Ergänzungen > Wahlpflichtbereich Praktische Informatik': 'Praktische Informatik',
};

export const AREAS = {
  'Allgemein': 'General',
  'Ergänzungen': 'Supplements',
  'Wahlpflichtbereich Praktische Informatik': 'Practical Computer Science Electives',
  'Praktische Informatik': 'Practical Computer Science',
  'Technische Informatik': 'Technical Computer Science',
  'Theoretische Informatik': 'Theoretical Computer Science',
  'Vertiefung in Mathematik/Elektrotechnik': 'Advanced studies in mathematics/electrical engineering',
  'Zulassung zum Master für Bewerber anderer wissenschaftlicher Hochschulen': 'Admission Requirements (Applicants from Other Universities)',
  'Auflagen zur Zulassung zum Master für Bewerber anderer wissenschaftlicher Hochschulen': 'Conditional Admission (Auflagen)',
  'Schwerpunkt': 'Specialization',
  'Freier Schwerpunkt': 'Free Specialization',
  'Schwerpunkt Computational Intelligence & Data Analytics': 'Specialization Computational Intelligence & Data Analytics',
  'Schwerpunkt Energieinformatik': 'Specialization Energy Informatics',
  'EI Pflicht': 'EI Compulsory',
  'EI Wahlpflicht Informatik': 'EI Electives Computer Science',
  'EI Wahlpflicht Energietechnik/Energiewirtschaft': 'EI Electives Power Engineering/Energy Economics',
  'Schwerpunkt Informatik für die digitale Gesellschaft': 'Specialization Computer Science for the Digital Society',
  'IDG Grundlegende Kurse A - Daten, Intelligente Systeme, Kontexte': 'IDG Foundational Courses A - Data, Intelligent Systems, Contexts',
  'IDG Grundlegende Kurse B - Design, Interaktion und Gesellschaft': 'IDG Foundational Courses B - Design, Interaction and Society',
  'IDG Fortgeschrittene Kurse': 'IDG Advanced Courses',
  'Schwerpunkt Softwareentwicklung': 'Specialization Software Development',
  'SE Pflicht': 'SE Compulsory',
  'SE Wahlpflicht': 'SE Electives',
  'Schwerpunkt Umweltinformatik': 'Specialization Environmental Informatics',
  'UW Pflicht': 'UW Compulsory',
  'UW Wahlpflicht Umwelt': 'UW Electives Environment',
  'UW Wahlpflicht Informatik': 'UW Electives Computer Science',
};

export const TYPES = {
  'Vorlesung': 'Lecture',
  'Übung': 'Exercise',
  'Seminar': 'Seminar',
  'Vorlesung/Übung': 'Lecture/Exercise',
  'Praktikum': 'Lab',
  'Vorlesung / Übung / Praktikum': 'Lecture / Exercise / Lab',
  'Projektarbeit': 'Project Work',
  'Projekt': 'Project',
};

// Research groups ("Fachgebiete"), used by the Masterseminar/Masterprojekt patterns below.
const GROUPS = {
  'Digitaltechnik': 'Digital Technology',
  'Digitaltechnik: Forschungsseminar': 'Digital Technology: Research Seminar',
  'Intelligente Eingebettete Systeme': 'Intelligent Embedded Systems',
  'Wissensverarbeitung': 'Knowledge Processing',
  'Wissensverarbeitung: Ausgewählte Themen der Wissensverarbeitung': 'Knowledge Processing: Selected Topics',
  'Kommunikationstechnik': 'Communication Technology',
  'Theoretische Informatik / Formale Methoden': 'Theoretical Computer Science / Formal Methods',
  'Partizipative IT-Gestaltung': 'Participatory IT Design',
  'Deep Semantic Learning': 'Deep Semantic Learning',
  'Rechnerarchitektur und Systemprogrammierung': 'Computer Architecture and System Programming',
  'Verteilte Systeme': 'Distributed Systems',
  'Programmiersprachen/-methodik': 'Programming Languages/Methodology',
  'Software Engineering': 'Software Engineering',
};

export const TITLES = {
  // modules
  'Arbeitswissenschaft': 'Work Science (Ergonomics)',
  'Ausgewählte Kapitel der Kommunikationstechnik II': 'Selected Topics in Communication Technology II',
  'Begriffliche Datenanalyse': 'Formal Concept Analysis',
  'Berechenbarkeit und Komplexität': 'Computability and Complexity',
  'Digitale Logik': 'Digital Logic',
  Stochastik: 'Stochastics',
  'Energiewirtschaftliche Aspekte der Energietechnik I': 'Energy-Economic Aspects of Power Engineering I',
  'Formale Grundlagen der Informatik': 'Formal Foundations of Computer Science',
  'Grundlagen der Energietechnik': 'Fundamentals of Power Engineering',
  'Intelligente Stromnetze': 'Smart Grids',
  'Labor Multimodal Machine Learning': 'Multimodal Machine Learning Lab',
  'Labor Qualitative Datenanalyse': 'Qualitative Data Analysis Lab',
  'Lineare Algebra': 'Linear Algebra',
  'Lineare Regelungssysteme': 'Linear Control Systems',
  'Mensch-Maschine-Systeme 2 - Benutzerorientierte Entwicklung': 'Human-Machine Systems 2 - User-Centered Development',
  'Ökologie und Globale Stoffkreisläufe': 'Ecology and Global Material Cycles',
  'Optimierungsverfahren': 'Optimization Methods',
  'Paralelle Programmierung': 'Parallel Programming',
  'Parallele Programmierung': 'Parallel Programming',
  'Funktionale Programmierung': 'Functional Programming',
  'Labor Netzwerke': 'Networks Lab',
  'Mensch-Maschine-Systeme 2': 'Human-Machine Systems 2',
  'Mensch-Maschine-Systeme 2 (mit Seminarteil)': 'Human-Machine Systems 2 (with seminar part)',
  'Soziale Netzwerkanalyse': 'Social Network Analysis',
  'Software-Verifikation': 'Software Verification',
  'Prozessrechner': 'Process Computers',
  'Introduction to Agent-Based Modelling': 'Introduction to Agent-Based Modelling',
  'Computing & Society': 'Computing & Society',
  'Natural Language Processing': 'Natural Language Processing',
  'Social Network Analysis': 'Social Network Analysis',
  'Process Computing': 'Process Computing',
  'Mobile Internet Project Work': 'Mobile Internet Project Work',
  'Quantum Computing': 'Quantum Computing',
  'Projekt': 'Project',
  'Schaltkreiskomplexität': 'Circuit Complexity',
  'Schlüsselkompetenzen': 'Key Competencies',
  'Seminar': 'Seminar',
  'Seminar im Fachgebiet Partizipative IT-Gestaltung': 'Seminar in Participatory IT Design',
  'Seminare technische/praktische Informatik': 'Seminars in Technical/Practical Computer Science',
  'Seminare theoretische Informatik/Mathematik': 'Seminars in Theoretical Computer Science/Mathematics',
  'Signal- und Bildverarbeitung': 'Signal and Image Processing',
  'Simulation regenerativer Energiesysteme': 'Simulation of Renewable Energy Systems',
  'Softwarepraktikum Netzsimulation': 'Software Lab: Power Grid Simulation',
  'Softwarepraktikum pandapower': 'Software Lab: pandapower',
  'Stochastik in der technischen Anwendung': 'Stochastics in Technical Applications',
  'Synthese und Optimierung mikroelektronischer Systeme': 'Synthesis and Optimization of Microelectronic Systems',
  'Technische Systeme im Zustandsraum': 'Technical Systems in State Space',
  'Verifikation eingebetteter Systeme': 'Verification of Embedded Systems',
  'Vertiefung Mathematik': 'Advanced Mathematics',
  'Grundlagen der modernen Kryptographie': 'Foundations of Modern Cryptography',
  'Datenschutzrecht': 'Data Protection Law',
  // courses
  'Lineare Algebra (E-Technik, Informatik, Mechatronik, W-Ing E-Technik, Berufspäd.)':
    'Linear Algebra (Electrical Eng., Computer Science, Mechatronics, Industrial Eng., Vocational Education)',
  'Übungen zu Lineare Algebra': 'Linear Algebra Exercises',
  'Lineare Algebra Hörsaalübungen': 'Linear Algebra Lecture-Hall Exercises',
  'Grundlagen der Algebra': 'Foundations of Algebra',
  'Übungen zu Grundlagen der Algebra und Computeralgebra': 'Foundations of Algebra and Computer Algebra Exercises',
  'Numerik I': 'Numerical Analysis I',
  'Übungen zu Numerik I': 'Numerical Analysis I Exercises',
  'Diskrete Mathematik I': 'Discrete Mathematics I',
  'Übung zu Diskrete Mathematik I (Graphentheorie) (Teil A und B)': 'Discrete Mathematics I Exercises (Graph Theory) (Parts A and B)',
  'Computeralgebra I (nur Teil B)': 'Computer Algebra I (Part B only)',
  'Übungen zu Computeralgebra I (Teil B)': 'Computer Algebra I Exercises (Part B)',
  'Seminar Intelligente Stromnetze': 'Smart Grids Seminar',
  'Communication Technologies 2 - Maschinelles Lernen und Kontexterkennung 2':
    'Communication Technologies 2 - Machine Learning and Context Recognition 2',
  'Ausgewählte Kapitel der Automatisierung': 'Selected Topics in Automation',
  'Seminar Mensch-Maschine-Systeme': 'Human-Machine Systems Seminar',
  'Ökologie und globale Stoffkreisläufe I': 'Ecology and Global Material Cycles I',
  'Ökologie und globale Stoffkreisläufe II': 'Ecology and Global Material Cycles II',
  'Präsentation und Moderation': 'Presentation and Moderation',
  'Tutorenqualifikation für Informatik': 'Tutor Training for Computer Science',
  'Präsentationstechniken für MINT': 'Presentation Techniques for STEM',
};

// Titles already in English (or proper names) are left as they are.
const ENGLISH_HINT = /\b(and|of|for|the|Learning|Lab|Engineering|Security|Techniques|Methods|Technologies|Code-Camp|Systems)\b/;

// Returns the English title, or null when no translation is known.
export function translateTitle(title) {
  if (!title) return null;
  if (TITLES[title]) return TITLES[title];
  if (FB16.titles[title]) return FB16.titles[title];
  if (UNI.titles[title]) return UNI.titles[title];
  const m = /^Master(seminar|projekt) im Fachge(?:biet|beit) (.+)$/.exec(title);
  if (m && GROUPS[m[2]]) return `Master ${m[1] === 'seminar' ? 'Seminar' : 'Project'}: ${GROUPS[m[2]]}`;
  if (ENGLISH_HINT.test(title) && !/[äöüß]/i.test(title)) return title;
  return null;
}

export const translateArea = (segment) => AREAS[segment] ?? FB16.areas[segment] ?? UNI.areas[segment] ?? null;
export const translateType = (type) => (type ? TYPES[type] ?? FB16.types[type] ?? UNI.types[type] ?? null : null);
export const translateProgram = (name) => UNI.programs[name] ?? null;

// Module handbook (moduldatenbank) that provides official module codes and English names.
export const HANDBOOK_URL = 'https://moduldatenbank.uni-kassel.de/showListAreas.php?id=120';

// eCampus title -> handbook code, where the two systems spell a module differently.
export const HANDBOOK_ALIASES = {
  'Communication Technologies II': 'TeI-05',
  'Java Code-Camp Context Awareness 2': 'TeI-03',
  'Mensch-Maschine-Systeme 2 - Benutzerorientierte Entwicklung': 'PI-09',
  'Ausgewählte Kapitel der Kommunikationstechnik II': 'TeI-02',
};

// Sections of the module list, in module handbook order. "category" sections take the modules of
// that requirement category; the others match by area path.
export const SECTIONS = [
  { id: 'Praktische Informatik', name: 'Elective Course Practical Computer Science', category: true },
  { id: 'Technische Informatik', name: 'Elective Course Technical Computer Science', category: true },
  { id: 'Theoretische Informatik', name: 'Elective Course Theoretical Computer Science', category: true },
  { id: 'Vertiefung in Mathematik/Elektrotechnik', name: 'Elective Course Mathematics/Electrical Engineering', category: true },
  { id: 'Projekt', name: 'Project Work', category: true },
  { id: 'Seminar', name: 'Seminar', category: true },
  { id: 'Schlüsselkompetenzen', name: 'Key Competencies', category: true },
  { id: 'main-subjects', name: 'Main Subjects (other modules)', areaPrefix: 'Schwerpunkt' },
  { id: 'admission', name: 'Admission Requirements (Auflagen)', areaPrefix: 'Zulassung zum Master' },
  { id: 'other', name: 'Other' },
];
