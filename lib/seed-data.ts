export type RoleRequirement = {
  id: string;
  title: string;
  level: string;
  department: string;
  family: string;
  location: string;
  requiredSkills: string[];
  preferredSkills: string[];
  learning: Record<string, string>;
};

export type MatchingConfig = {
  scoringWeights: {
    required: number;
    preferred: number;
  };
  skillAliases: Record<string, string[]>;
};

export const matchingConfig: MatchingConfig = {
  scoringWeights: {
    required: 2,
    preferred: 1
  },
  skillAliases: {
    "api design": ["api development", "apis", "rest design", "restful api design"],
    aws: ["amazon web services"],
    "ci cd": ["ci/cd", "ci-cd", "continuous integration", "continuous delivery", "continuous deployment"],
    dashboarding: ["dashboards", "dashboard development", "bi dashboards"],
    docker: ["dockerized", "containers", "containerization"],
    excel: ["spreadsheets", "microsoft excel"],
    git: ["github", "gitlab", "version control"],
    javascript: ["js"],
    kubernetes: ["k8s"],
    node: ["node.js", "nodejs"],
    postgresql: ["postgres", "postgres sql"],
    "rest api": ["rest", "restful", "restful api", "rest apis", "rest services"],
    security: ["cybersecurity", "appsec", "application security"],
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
    learning: {
      typescript: "TypeScript Fundamentals - internal course",
      react: "React Production Patterns workshop",
      node: "Node.js API Services lab",
      sql: "SQL for Application Developers",
      aws: "AWS Cloud Practitioner path",
      testing: "Frontend Testing with Vitest",
      "api design": "REST API Design checklist",
      docker: "Container Basics for App Runner"
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
      microservices: "Microservices Design Review"
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
    learning: {
      sql: "Advanced SQL reporting lab",
      python: "Python for Analytics course",
      statistics: "Statistics for Business Decisions",
      dashboarding: "Dashboard Storytelling workshop",
      tableau: "Tableau Essentials",
      "data modeling": "Dimensional Modeling primer",
      communication: "Executive Metrics Briefing practice"
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
    learning: {
      aws: "AWS Solutions Foundations",
      linux: "Linux Operations bootcamp",
      networking: "Networking Core Concepts",
      troubleshooting: "Incident Triage simulations",
      "customer support": "Customer Escalation Handling",
      security: "Cloud Security Basics",
      postgresql: "Managed Databases overview",
      docker: "Containers for Support Engineers"
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
      docker: "Container Security Basics"
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
    learning: {
      communication: "Executive Metrics Briefing practice",
      roadmapping: "Product Roadmapping workshop",
      analytics: "Product Analytics Foundations",
      "stakeholder management": "Stakeholder Alignment playbook",
      sql: "SQL for Product Managers",
      aws: "AWS Cloud Practitioner path",
      agile: "Agile Delivery Practices",
      "user research": "User Research Methods",
      dashboarding: "Dashboard Storytelling workshop"
    }
  }
];

export const sampleResume = `React developer with 2 years of experience building TypeScript dashboards.
Skilled in JavaScript, React, Node APIs, SQL, Git, Vitest testing, and REST API design.
Completed AWS Cloud Practitioner training and shipped Dockerized internal tools.`;
