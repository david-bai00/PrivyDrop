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
};

export type Header = {
  Home_dis: string;
  Blog_dis: string;
  About_dis: string;
  Help_dis: string;
  FAQ_dis: string;
  Features_dis: string;
  Terms_dis: string;
  Privacy_dis: string;
};

export type Footer = {
  CopyrightNotice: string;
  Terms_dis: string;
  Privacy_dis: string;
  SupportedLanguages: string;
};

export type Privacy = {
  PrivacyPolicy_dis: string;
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
  TermsOfUse_dis: string;
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
  Help_dis: string;
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
  h2_P: string;
  btn_try: string;
  step1_title: string;
  step1_description: string;
  step2_title: string;
  step2_description: string;
  step3_title: string;
  step3_description: string;
};

export type SystemDiagram = {
  h2: string;
  h2_P: string;
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
  FAQ_dis: string;
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
  Pasted_dis: string;
  Copied_dis: string;
};

export type FileUploadHandler = {
  NoFileChosen_tips: string;
  fileChosen_tips_template: string;
  chooseFileTips: string;
  dragTips: string;
  chosenDiagTitle: string;
  chosenDiagDescription: string;
  SelectFile_dis: string;
  SelectFolder_dis: string;
};

export type FileTransferButton = {
  SavedToDisk_tips: string;
  CurrentFileTransferring_tips: string;
  OtherFileTransferring_tips: string;
  download_tips: string;
  Saved_dis: string;
  Waiting_dis: string;
  Download_dis: string;
};

export type FileListDisplay = {
  sending_dis: string;
  receiving_dis: string;
  finish_dis: string;
  delete_dis: string;
  downloadNum_dis: string;
  folder_tips_template: string;
  folder_dis_template: string;
  PopupDialog_title: string;
  PopupDialog_description: string;
  chooseSavePath_tips: string;
  chooseSavePath_dis: string;
  safeSave_dis: string;
  safeSave_tooltip: string;
  safeSaveSuccessMsg: string;
};

export type RetrieveMethod = {
  P: string;
  RoomId_tips: string;
  copyRoomId_tips: string;
  url_tips: string;
  copyUrl_tips: string;
  scanQR_tips: string;
  Copied_dis: string;
  Copy_QR_dis: string;
  download_QR_dis: string;
};

export type RoomCheck = {
  empty_msg: string;
  available_msg: string;
  notAvailable_msg: string;
};

export type JoinRoom = {
  EmptyMsg: string;
  DuplicateMsg: string;
  successMsg: string;
  notExist: string;
  failMsg: string;
};

export type RoomStatus = {
  senderEmptyMsg: string;
  receiverEmptyMsg: string;
  onlyOneMsg: string;
  peopleMsg_template: string;
  connected_dis: string;
  senderDisconnectedMsg: string;
  leftRoomMsg: string;
};

export type ClipboardAppHtml = {
  senderTab: string;
  retrieveTab: string;
  shareTitle_dis: string;
  retrieveTitle_dis: string;
  RoomStatus_dis: string;
  Paste_dis: string;
  Copy_dis: string;
  inputRoomIdprompt: string;
  joinRoomBtn: string;
  readClipboardToRoomId: string;
  enterRoomID_placeholder: string;
  retrieveMethod: string;
  inputRoomId_tips: string;
  joinRoom_dis: string;
  SyncSending_loadingText: string;
  SyncSending_dis: string;
  readClipboard_dis: string;
  retrieveRoomId_placeholder: string;
  RetrieveMethodTitle: string;
};

export type ClipboardApp = {
  fetchRoom_err: string;
  roomCheck: RoomCheck;
  channelOpen_msg: string;
  waitting_tips: string;
  joinRoom: JoinRoom;
  pickSaveMsg: string;
  roomStatus: RoomStatus;
  html: ClipboardAppHtml;
};

export type Home = {
  h1: string;
  h1P: string;
  h2_screenOnly: string;
  h2_demo: string;
  h2P_demo: string;
  watch_tips: string;
  youtube_tips: string;
  bilibili_tips: string;
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
};

export type Messages = {
  meta: Meta;
  text: Text;
};
