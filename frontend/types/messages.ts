// types/messages.ts

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

export type Header = {
  homeLabel: string;
  blogLabel: string;
  aboutLabel: string;
  helpLabel: string;
  faqLabel: string;
  featuresLabel: string;
  termsLabel: string;
  privacyLabel: string;
};

export type Footer = {
  copyrightNotice: string;
  termsLabel: string;
  privacyLabel: string;
  supportedLanguagesLabel: string;
};

export type Privacy = {
  privacyPolicyLabel: string;
  h1: string;
  h1_P: string;
  h2_1: string;
  h2_1_P: string;
  h2_2: string;
  h2_2_P: string;
  h2_3: string;
  h2_3_P: string;
  h2_4: string;
  h2_4_P: string;
  h2_5: string;
  h2_5_P: string;
};

export type Terms = {
  termsOfUseLabel: string;
  h1: string;
  h1_P: string;
  h2_1: string;
  h2_1_P: string;
  h2_2: string;
  h2_2_P: string;
  h2_3: string;
  h2_3_P: string;
  h2_4: string;
  h2_4_P: string;
  h2_5: string;
  h2_5_P: string;
};

export type Help = {
  helpLabel: string;
  h1: string;
  h1_P: string;
  h2_1: string;
  h2_1_P1: string;
  h2_1_P2: string;
  h2_2: string;
  h2_2_P: string;
  h2_3: string;
  h2_3_P: string;
};

export type About = {
  h1: string;
  P1: string;
  P2: string;
  P3: string;
  P4: string;
  P5: string;
};

export type HowItWorks = {
  h2: string;
  h2Description: string;
  tryNowLabel: string;
  step1Title: string;
  step1Description: string;
  step2Title: string;
  step2Description: string;
  step3Title: string;
  step3Description: string;
};

export type SystemDiagram = {
  h2: string;
  h2Description: string;
};

export type BlogTexts = {
  listTitle: string;
  listSubtitle: string;
  recentPosts: string;
  tags: string;
  readMore: string;
  by: string;
  postNotFound: string;
  tocTitle: string;
  tagTitlePrefix: string;
  tagSubtitleTemplate: string; // use {tag} as placeholder
  tagEmpty: string;
};

export type KeyFeatures = {
  h2: string;
  h3_1: string;
  h3_1_P: string;
  h3_2: string;
  h3_2_P: string;
  h3_3: string;
  h3_3_P: string;
  h3_4: string;
  h3_4_P: string;
  h3_5: string;
  h3_5_P: string;
  h3_6: string;
  h3_6_P: string;
};

export type FAQ = {
  faqLabel: string;
  question_0: string;
  answer_0: string;
  question_1: string;
  answer_1: string;
  question_2: string;
  answer_2: string;
  question_3: string;
  answer_3: string;
  question_4: string;
  answer_4: string;
  question_5: string;
  answer_5: string;
  question_6: string;
  answer_6: string;
  question_7: string;
  answer_7: string;
  question_8: string;
  answer_8: string;
  question_9: string;
  answer_9: string;
  question_10: string;
  answer_10: string;
  question_11: string;
  answer_11: string;
  question_12: string;
  answer_12: string;
  question_13: string;
  answer_13: string;
};

export type ClipboardBtn = {
  pastedLabel: string;
  copiedLabel: string;
};

export type FileUploadHandler = {
  noFileChosenTip: string;
  fileChosenTemplate: string;
  chooseFileTip: string;
  dragTip: string;
  chosenDiagTitle: string;
  chosenDiagDescription: string;
  selectFileLabel: string;
  selectFolderLabel: string;
};

export type FileTransferButton = {
  savedToDiskTip: string;
  currentFileTransferringTip: string;
  otherFileTransferringTip: string;
  downloadTip: string;
  pendingSaveTip: string;
  savedLabel: string;
  waitingLabel: string;
  downloadLabel: string;
  saveLabel: string;
};

export type FileListDisplay = {
  sendingLabel: string;
  receivingLabel: string;
  finishedLabel: string;
  deleteLabel: string;
  downloadCountLabel: string;
  folderSummaryTemplate: string;
  folderInlineTemplate: string;
  popupDialogTitle: string;
  popupDialogDescription: string;
  chooseSavePathTip: string;
  chooseSavePathLabel: string;
};

export type RetrieveMethod = {
  introMessage: string;
  roomIdTip: string;
  copyRoomIdTip: string;
  urlTip: string;
  copyUrlTip: string;
  scanQrTip: string;
  copiedLabel: string;
  copyQrLabel: string;
  downloadQrLabel: string;
};

export type RoomCheck = {
  emptyMessage: string;
  availableMessage: string;
  notAvailableMessage: string;
};

export type JoinRoom = {
  emptyMessage: string;
  duplicateMessage: string;
  successMessage: string;
  notFoundMessage: string;
  failureMessage: string;
};

export type RoomStatus = {
  senderEmptyMessage: string;
  receiverEmptyMessage: string;
  onlyOneMessage: string;
  peopleCountTemplate: string;
  connectedLabel: string;
  senderDisconnectedMessage: string;
  leftRoomMessage: string;
  leaveRoomLabel: string;
};

export type ClipboardAppHtml = {
  senderTab: string;
  retrieveTab: string;
  shareTitleLabel: string;
  retrieveTitleLabel: string;
  roomStatusLabel: string;
  pasteLabel: string;
  copyLabel: string;
  inputRoomIdPrompt: string;
  joinRoomButtonLabel: string;
  generateSimpleIdTip: string;
  generateRandomIdTip: string;
  readClipboardToRoomId: string;
  enterRoomIdPlaceholder: string;
  retrieveMethod: string;
  inputRoomIdTip: string;
  joinRoomLabel: string;
  syncSendingLoadingLabel: string;
  syncSendingLabel: string;
  readClipboardLabel: string;
  retrieveRoomIdPlaceholder: string;
  retrieveMethodTitle: string;
  // New: cached ID utilities
  saveIdLabel: string;
  useCachedIdLabel: string;
  saveIdTip: string;
  useCachedIdTip: string;
};

export type ClipboardApp = {
  fetchRoomError: string;
  roomCheck: RoomCheck;
  channelOpenMessage: string;
  waitingTip: string;
  joinRoom: JoinRoom;
  pickSaveMsg: string;
  pickSaveUnsupported: string;
  pickSaveSuccess: string;
  pickSaveError: string;
  roomStatus: RoomStatus;
  html: ClipboardAppHtml;
  fileExistMsg?: string;
  noFilesForFolderMsg?: string;
  zipError?: string;
  fileNotFoundMsg?: string;
  confirmLeaveWhileTransferring: string;
  leaveWhileTransferringSuccess: string;
  // New: cache messages
  saveIdSuccessMessage: string;
  // UI connection feedback
  joinInProgress: string;
  joinSlow: string;
  joinTimeout: string;
  // Slow P2P negotiation hint
  rtcSlow: string;
  rtcNegotiating: string;
  rtcConnected: string;
  rtcReconnecting: string;
  rtcRestored: string;
};

export type Home = {
  h1: string;
  h1P: string;
  h2ScreenOnly: string;
  h2Demo: string;
  h2DemoDescription: string;
  watchTip: string;
  youtubeTip: string;
  bilibiliTip: string;
};

export type Text = {
  Header: Header;
  Footer: Footer;
  privacy: Privacy;
  terms: Terms;
  help: Help;
  about: About;
  HowItWorks: HowItWorks;
  SystemDiagram: SystemDiagram;
  KeyFeatures: KeyFeatures;
  faqs: FAQ;
  clipboard_btn: ClipboardBtn;
  fileUploadHandler: FileUploadHandler;
  FileTransferButton: FileTransferButton;
  FileListDisplay: FileListDisplay;
  RetrieveMethod: RetrieveMethod;
  ClipboardApp: ClipboardApp;
  home: Home;
  blog: BlogTexts;
};

export type Messages = {
  meta: Meta;
  text: Text;
};
