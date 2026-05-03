export type RoleRequirement = {
  id: string;
  title: string;
  level: string;
  department: string;
  family: string;
  location: string;
  requiredSkills: string[];
  preferredSkills: string[];
  requiredCertifications: string[];
  preferredCertifications: string[];
  minimumYearsExperience: number;
  idealYearsExperience: number;
  requiredSoftSkills: string[];
  preferredSoftSkills: string[];
  learning: Record<string, string>;
};

export type MatchingConfig = {
  scoringWeights: {
    requiredSkill: number;
    preferredSkill: number;
    requiredCertification: number;
    preferredCertification: number;
    experience: number;
    requiredSoftSkill: number;
    preferredSoftSkill: number;
  };
  skillAliases: Record<string, string[]>;
};

export const matchingConfig: MatchingConfig = {
  scoringWeights: {
    requiredSkill: 2,
    preferredSkill: 1,
    requiredCertification: 2,
    preferredCertification: 1,
    experience: 2,
    requiredSoftSkill: 1,
    preferredSoftSkill: 1
  },
  skillAliases: {
    "api design": ["api development", "apis", "rest design", "restful api design"],
    adaptability: ["adaptable", "adapted quickly", "flexible"],
    analytics: ["analytical thinking", "data analysis", "product analytics"],
    aws: ["amazon web services"],
    collaboration: ["cross functional collaboration", "cross-functional collaboration", "teamwork"],
    "ci cd": ["ci/cd", "ci-cd", "continuous integration", "continuous delivery", "continuous deployment"],
    communication: ["written communication", "verbal communication", "presentation skills"],
    compliance: ["regulatory compliance", "controls compliance"],
    "customer empathy": ["customer-first mindset", "customer focus", "customer focused"],
    dashboarding: ["dashboards", "dashboard development", "bi dashboards"],
    decision making: ["decision-making", "prioritization"],
    docker: ["dockerized", "containers", "containerization"],
    excel: ["spreadsheets", "microsoft excel"],
    git: ["github", "gitlab", "version control"],
    javascript: ["js"],
    kubernetes: ["k8s"],
    leadership: ["team leadership", "technical leadership", "leading initiatives"],
    node: ["node.js", "nodejs"],
    postgresql: ["postgres", "postgres sql"],
    "problem solving": ["problem-solving", "analytical problem solving", "solve complex problems"],
    "rest api": ["rest", "restful", "restful api", "rest apis", "rest services"],
    security: ["cybersecurity", "appsec", "application security"],
    "stakeholder management": ["stakeholder alignment", "cross-functional alignment", "executive stakeholder management"],
    sql: ["structured query language"],
    testing: ["tests", "test automation", "unit testing", "vitest"],
    typescript: ["ts"]
  }
};

export const roles: RoleRequirement[] = [
  {
    id: "sde-i",
    title: "Software Development Engineer I",
    level: "Entry",
    department: "Consumer Tech",
    family: "Software Engineering",
    location: "Seattle, WA",
    requiredSkills: ["javascript", "typescript", "react", "node", "sql", "git"],
    preferredSkills: ["aws", "testing", "api design", "docker"],
    requiredCertifications: [],
    preferredCertifications: ["aws certified cloud practitioner"],
    minimumYearsExperience: 1,
    idealYearsExperience: 2,
    requiredSoftSkills: ["communication", "problem solving"],
    preferredSoftSkills: ["collaboration", "adaptability"],
    learning: {
      typescript: "TypeScript Fundamentals - internal course",
      react: "React Production Patterns workshop",
      node: "Node.js API Services lab",
      sql: "SQL for Application Developers",
      aws: "AWS Cloud Practitioner path",
      testing: "Frontend Testing with Vitest",
      "api design": "REST API Design checklist",
      docker: "Container Basics for App Runner",
      communication: "Engineering Communication in Practice",
      "problem solving": "Structured Problem Solving workshop",
      collaboration: "Cross-team Delivery Essentials",
      adaptability: "Adaptability in Fast-moving Product Teams",
      "aws certified cloud practitioner": "AWS Cloud Practitioner certification prep"
    }
  },
  {
    id: "sde-ii",
    title: "Software Development Engineer II",
    level: "Mid",
    department: "Amazon Stores",
    family: "Software Engineering",
    location: "Seattle, WA",
    requiredSkills: [
      "java",
      "system design",
      "data structures",
      "aws",
      "sql",
      "rest api",
      "git"
    ],
    preferredSkills: ["distributed systems", "kubernetes", "docker", "ci cd", "microservices"],
    requiredCertifications: [],
    preferredCertifications: ["aws certified developer associate"],
    minimumYearsExperience: 3,
    idealYearsExperience: 5,
    requiredSoftSkills: ["communication", "problem solving"],
    preferredSoftSkills: ["leadership", "collaboration"],
    learning: {
      java: "Java Engineering Foundations",
      "system design": "System Design Fundamentals",
      "data structures": "Data Structures refresher",
      aws: "Building Scalable Systems on AWS",
      sql: "SQL Performance Basics",
      "rest api": "REST API Design checklist",
      "distributed systems": "Distributed Systems mentoring path",
      kubernetes: "Kubernetes Essentials",
      docker: "Docker Deep Dive",
      "ci cd": "CI/CD with AWS CodePipeline",
      microservices: "Microservices Design Review",
      communication: "Technical Design Communication workshop",
      "problem solving": "Advanced Engineering Problem Solving",
      leadership: "Influencing Without Authority",
      collaboration: "Cross-team Architecture Reviews",
      "aws certified developer associate": "AWS Developer Associate certification prep"
    }
  },
  {
    id: "data-analyst",
    title: "Data Analyst",
    level: "Associate",
    department: "People Analytics",
    family: "Analytics",
    location: "Austin, TX",
    requiredSkills: ["sql", "python", "excel", "statistics", "dashboarding"],
    preferredSkills: ["tableau", "data modeling", "communication"],
    requiredCertifications: [],
    preferredCertifications: ["tableau desktop specialist"],
    minimumYearsExperience: 2,
    idealYearsExperience: 4,
    requiredSoftSkills: ["analytics", "decision making"],
    preferredSoftSkills: ["stakeholder management", "collaboration"],
    learning: {
      sql: "Advanced SQL reporting lab",
      python: "Python for Analytics course",
      statistics: "Statistics for Business Decisions",
      dashboarding: "Dashboard Storytelling workshop",
      tableau: "Tableau Essentials",
      "data modeling": "Dimensional Modeling primer",
      communication: "Executive Metrics Briefing practice",
      analytics: "Analytical Thinking for Insights Teams",
      "stakeholder management": "Stakeholder Alignment playbook",
      "decision making": "Data-backed Decision Making workshop",
      collaboration: "Cross-functional Insight Delivery practice",
      "tableau desktop specialist": "Tableau certification prep"
    }
  },
  {
    id: "cloud-support",
    title: "Cloud Support Associate",
    level: "Entry",
    department: "AWS Support",
    family: "Cloud Operations",
    location: "Dallas, TX",
    requiredSkills: ["aws", "linux", "networking", "troubleshooting", "customer support"],
    preferredSkills: ["python", "security", "postgresql", "docker"],
    requiredCertifications: [],
    preferredCertifications: ["aws certified cloud practitioner"],
    minimumYearsExperience: 1,
    idealYearsExperience: 3,
    requiredSoftSkills: ["communication", "customer empathy"],
    preferredSoftSkills: ["adaptability", "problem solving"],
    learning: {
      aws: "AWS Solutions Foundations",
      linux: "Linux Operations bootcamp",
      networking: "Networking Core Concepts",
      troubleshooting: "Incident Triage simulations",
      "customer support": "Customer Escalation Handling",
      security: "Cloud Security Basics",
      postgresql: "Managed Databases overview",
      docker: "Containers for Support Engineers",
      communication: "Customer-facing Technical Communication",
      "customer empathy": "Support Empathy Labs",
      adaptability: "Shift-ready Troubleshooting practice",
      "problem solving": "Root Cause Analysis drills",
      "aws certified cloud practitioner": "AWS Cloud Practitioner certification prep"
    }
  },
  {
    id: "security-engineer",
    title: "Security Engineer",
    level: "Mid",
    department: "InfoSec",
    family: "Security",
    location: "Arlington, VA",
    requiredSkills: ["security", "aws", "linux", "python", "networking", "incident response"],
    preferredSkills: ["threat modeling", "sql", "compliance", "docker"],
    requiredCertifications: [],
    preferredCertifications: ["security+"],
    minimumYearsExperience: 3,
    idealYearsExperience: 5,
    requiredSoftSkills: ["communication", "problem solving"],
    preferredSoftSkills: ["leadership", "decision making"],
    learning: {
      security: "Security Engineering Foundations",
      aws: "AWS Security Specialty path",
      linux: "Linux Operations bootcamp",
      python: "Python Automation for Security",
      networking: "Network Security Core Concepts",
      "incident response": "Incident Response tabletop exercises",
      "threat modeling": "Threat Modeling workshop",
      sql: "SQL for Investigations",
      compliance: "Compliance Controls overview",
      docker: "Container Security Basics",
      communication: "Security Incident Communication playbook",
      "problem solving": "Adversarial Problem Solving lab",
      leadership: "Incident Leadership practice",
      "decision making": "High-pressure Security Decision Making",
      "security+": "CompTIA Security+ certification prep"
    }
  },
  {
    id: "product-manager",
    title: "Technical Product Manager",
    level: "Mid",
    department: "Product",
    family: "Product Management",
    location: "New York, NY",
    requiredSkills: ["communication", "roadmapping", "analytics", "stakeholder management", "sql"],
    preferredSkills: ["aws", "agile", "user research", "dashboarding"],
    requiredCertifications: [],
    preferredCertifications: ["pmp", "scrum master"],
    minimumYearsExperience: 3,
    idealYearsExperience: 6,
    requiredSoftSkills: ["decision making", "leadership"],
    preferredSoftSkills: ["collaboration", "customer empathy"],
    learning: {
      communication: "Executive Metrics Briefing practice",
      roadmapping: "Product Roadmapping workshop",
      analytics: "Product Analytics Foundations",
      "stakeholder management": "Stakeholder Alignment playbook",
      sql: "SQL for Product Managers",
      aws: "AWS Cloud Practitioner path",
      agile: "Agile Delivery Practices",
      "user research": "User Research Methods",
      dashboarding: "Dashboard Storytelling workshop",
      "decision making": "Product Decision Framing",
      leadership: "Product Leadership Essentials",
      collaboration: "Cross-functional Delivery Routines",
      "customer empathy": "Voice of Customer immersion series",
      pmp: "PMP certification prep",
      "scrum master": "Scrum Master certification prep"
    }
  }
];

export const sampleResume = `React developer with 2 years of experience building TypeScript dashboards.
Skilled in JavaScript, React, Node APIs, SQL, Git, Vitest testing, and REST API design.
Known for strong communication, problem solving, and cross-functional collaboration.
Completed AWS Certified Cloud Practitioner training and shipped Dockerized internal tools.`;
