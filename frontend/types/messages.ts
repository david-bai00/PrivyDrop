// types/messages.ts - Refactored with semantic naming

// SEO Meta
export type MetaData = {
  title: string;
  description: string;
  keywords?: string;
};

export type Meta = {
  home: MetaData;
  about: MetaData;
  faq: MetaData;
  features: MetaData;
  help: MetaData;
  privacy: MetaData;
  terms: MetaData;
  blog: MetaData;
};

// Navigation (formerly Header)
export type Navigation = {
  home: string;
  blog: string;
  about: string;
  help: string;
  faq: string;
  features: string;
  terms: string;
  privacy: string;
};

// Footer
export type Footer = {
  copyright: string;
  terms: string;
  privacy: string;
  supportedLanguages: string;
};

// Privacy Policy
export type Privacy = {
  policyLabel: string;
  h1: string;
  h1Paragraph: string;
  sections: {
    informationCollection: string;
    informationCollectionParagraph: string;
    dataStorage: string;
    dataStorageParagraph: string;
    thirdPartyServices: string;
    thirdPartyServicesParagraph: string;
    amendments: string;
    amendmentsParagraph: string;
    contactUs: string;
    contactUsParagraph: string;
  };
};

// Terms of Use
export type Terms = {
  useLabel: string;
  h1: string;
  h1Paragraph: string;
  sections: {
    useOfService: string;
    useOfServiceParagraph: string;
    dataPrivacy: string;
    dataPrivacyParagraph: string;
    acceptableUse: string;
    acceptableUseParagraph: string;
    liability: string;
    liabilityParagraph: string;
    changes: string;
    changesParagraph: string;
  };
};

// Help & Support
export type Help = {
  label: string;
  h1: string;
  h1Paragraph: string;
  sections: {
    contactUs: string;
    contactUsParagraph1: string;
    contactUsParagraph2: string;
    socialMedia: string;
    socialMediaParagraph: string;
    additionalResources: string;
    additionalResourcesParagraph: string;
  };
};

// About
export type About = {
  h1: string;
  paragraphs: string[];
};

// How It Works
export type HowItWorks = {
  title: string;
  description: string;
  tryNow: string;
  step1Title: string;
  step1Description: string;
  step2Title: string;
  step2Description: string;
  step3Title: string;
  step3Description: string;
};

// System Diagram
export type SystemDiagram = {
  title: string;
  description: string;
};

// Key Features
export type KeyFeatures = {
  title: string;
  items: {
    directSecure: { title: string; description: string };
    teamSynergy: { title: string; description: string };
    noLimits: { title: string; description: string };
    swift: { title: string; description: string };
    greenClean: { title: string; description: string };
    resumable: { title: string; description: string };
  };
};

// FAQ
export type FAQ = {
  title: string;
  items: Array<{
    question: string;
    answer: string;
  }>;
};

// Blog
export type Blog = {
  listTitle: string;
  listSubtitle: string;
  recentPosts: string;
  tags: string;
  readMore: string;
  by: string;
  postNotFound: string;
  tocTitle: string;
  tagTitlePrefix: string;
  tagSubtitleTemplate: string;
  tagEmpty: string;
};

// Common UI elements
export type Common = {
  clipboard: {
    pasted: string;
    copied: string;
    copyError: string;
    readError: string;
    loading: string;
  };
  buttons: {
    request: string;
    download: string;
    save: string;
    copy: string;
    paste: string;
    joinRoom: string;
    leaveRoom: string;
  };
};

// Clipboard Core
export type Clipboard = {
  tabs: {
    send: string;
    retrieve: string;
  };
  titles: {
    share: string;
    retrieve: string;
    retrieveMethod: string;
  };
  actions: {
    sync: string;
    syncLoading: string;
    readClipboard: string;
  };
  placeholders: {
    roomId: string;
  };
  status: {
    roomEmpty: string;
    receiverCanAccept: string;
    onlyOne: string;
    peopleCount: string;
    connected: string;
    senderDisconnected: string;
    leftRoom: string;
  };
  messages: {
    fileExist: string;
    noFilesForFolder: string;
    zipError: string;
    fileNotFound: string;
    confirmLeave: string;
    leaveSuccess: string;
    fetchRoomError: string;
    generateShareLinkError: string;
    leaveRoomError: string;
    validateRoomError: string;
    resetSenderStateError: string;
    channelOpen: string;
    waiting: string;
  };
  join: {
    empty: string;
    duplicate: string;
    success: string;
    notFound: string;
    failure: string;
    inProgress: string;
    slow: string;
    timeout: string;
  };
  rtc: {
    slow: string;
    negotiating: string;
    connected: string;
    reconnecting: string;
    restored: string;
  };
  roomCheck: {
    empty: string;
    available: string;
    notAvailable: string;
  };
  saveLocation: {
    pickMsg: string;
    unsupported: string;
    success: string;
    error: string;
  };
  cachedId: {
    save: string;
    use: string;
    saveTip: string;
    useTip: string;
    saveSuccess: string;
  };
  generateId: {
    simple: string;
    random: string;
  };
};

// File Upload
export type FileUpload = {
  noFileChosen: string;
  fileChosen: string;
  chooseTip: string;
  dragTip: string;
  dialog: {
    title: string;
    description: string;
    selectFile: string;
    selectFolder: string;
  };
};

// File List
export type FileList = {
  sending: string;
  receiving: string;
  finished: string;
  delete: string;
  downloadCount: string;
  folderSummary: string;
  folderInline: string;
  saveDialog: {
    title: string;
    description: string;
    tip: string;
    button: string;
  };
};

// File Transfer Button
export type FileTransfer = {
  savedToDisk: string;
  currentTransferring: string;
  otherTransferring: string;
  download: string;
  pendingSave: string;
  saved: string;
  waiting: string;
};

// Retrieve Method (Share Card)
export type RetrieveMethod = {
  intro: string;
  roomIdTip: string;
  copyRoomId: string;
  urlTip: string;
  copyUrl: string;
  scanQr: string;
  copied: string;
  copyQr: string;
  downloadQr: string;
};

// Home Page
export type Home = {
  hero: {
    title: string;
    subtitle: string;
    screenOnlyTitle: string;
  };
  demo: {
    title: string;
    description: string;
    watchTip: string;
    youtube: string;
    bilibili: string;
  };
};

// Text namespace (all UI strings)
export type Text = {
  navigation: Navigation;
  footer: Footer;
  privacy: Privacy;
  terms: Terms;
  help: Help;
  about: About;
  howItWorks: HowItWorks;
  systemDiagram: SystemDiagram;
  keyFeatures: KeyFeatures;
  faq: FAQ;
  blog: Blog;
  common: Common;
  clipboard: Clipboard;
  fileUpload: FileUpload;
  fileList: FileList;
  fileTransfer: FileTransfer;
  retrieveMethod: RetrieveMethod;
  home: Home;
};

// Root Messages type
export type Messages = {
  meta: Meta;
  text: Text;
};
