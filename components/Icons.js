// Τα εικονίδια της εφαρμογής: μία οικογένεια γραμμικών εικονιδίων (Material Symbols),
// από τη γραμματοσειρά που φορτώνει το app/layout.js (μόνο τα ονόματα της ICON_NAMES).
// Παίρνουν το χρώμα του κειμένου· size = μέγεθος σε px.
const icon = (name, filled = false) => {
  // eslint-disable-next-line no-unused-vars
  const Icon = ({ size = 22, className, style, strokeWidth, ...props }) => (
    <span
      className={`ms${filled ? ' fill' : ''}${className ? ` ${className}` : ''}`}
      style={{ fontSize: size, ...style }}
      aria-hidden={props['aria-label'] ? undefined : 'true'}
      role={props['aria-label'] ? 'img' : undefined}
      translate="no"
      {...props}
    >
      {name}
    </span>
  );
  return Icon;
};

export const ArchiveIcon = icon('photo_library');
export const CompareIcon = icon('compare');
export const WeightIcon = icon('monitor_weight');
export const DailyIcon = icon('event_available');
export const UsersIcon = icon('group');
// Ομάδες / κοινότητα
export const GroupsIcon = icon('groups');
export const PlanIcon = icon('assignment');
export const DumbbellIcon = icon('fitness_center');
export const FoodIcon = icon('restaurant');
export const UserIcon = icon('person');
export const LogoutIcon = icon('logout');
export const UploadIcon = icon('upload');
export const DownloadIcon = icon('download');
export const AlertIcon = icon('warning');
export const QuestionIcon = icon('help');
export const MicIcon = icon('mic');
export const PlayIcon = icon('play_arrow', true);
export const PauseIcon = icon('pause', true);
export const CloseIcon = icon('close');
export const PlusIcon = icon('add');
export const BackIcon = icon('chevron_left');
export const ArrowForwardIcon = icon('arrow_forward');
export const SearchIcon = icon('search');
export const LinkIcon = icon('link');
export const ImageIcon = icon('image');
export const ChatIcon = icon('chat');
export const SendIcon = icon('send', true);
export const TicksIcon = icon('done_all');
// Για το μενού κάθε αθλούμενου στη λίστα
export const ChevronIcon = icon('expand_more');
export const PinIcon = icon('keep');
export const BellOffIcon = icon('notifications_off');
export const HeartIcon = icon('favorite');
export const ArchiveBoxIcon = icon('archive');
export const ReadIcon = icon('drafts');
export const UnreadIcon = icon('mark_email_unread');
export const GroupAddIcon = icon('group_add');
export const TrashIcon = icon('delete');
export const MoreIcon = icon('more_vert');
export const StarIcon = icon('star');
export const StarFilledIcon = icon('star', true);
export const SelectIcon = icon('check_box');
export const ReadAllIcon = icon('done_all');
export const LockIcon = icon('lock');
export const CopyIcon = icon('content_copy');
export const CheckIcon = icon('check');
export const BackspaceIcon = icon('backspace');
export const MoonIcon = icon('dark_mode');
export const SlidersIcon = icon('tune');
export const ClockIcon = icon('schedule');
export const EditIcon = icon('edit');

// Κλήσεις
export const PhoneIcon = icon('call');
export const PhoneOffIcon = icon('call_end', true);
export const VideoIcon = icon('videocam');
export const VideoOffIcon = icon('videocam_off');
export const MicOffIcon = icon('mic_off');
export const ScreenIcon = icon('present_to_all');
export const FlipIcon = icon('cameraswitch');
export const MinimizeIcon = icon('close_fullscreen');

// Τα ονόματα που χρειάζεται η γραμματοσειρά (αλφαβητικά, όπως τα θέλει η υπηρεσία γραμματοσειρών).
export const ICON_NAMES = [
  'add', 'archive', 'arrow_forward', 'assignment', 'backspace', 'call', 'call_end', 'cameraswitch', 'chat', 'check', 'check_box',
  'chevron_left', 'close', 'close_fullscreen', 'compare', 'content_copy', 'dark_mode', 'delete', 'done_all', 'download', 'drafts',
  'edit', 'event_available', 'expand_more', 'favorite', 'fitness_center', 'group', 'group_add', 'groups', 'help', 'image', 'keep',
  'link', 'lock', 'logout', 'mark_email_unread', 'mic', 'mic_off', 'monitor_weight', 'more_vert', 'notifications_off', 'pause',
  'person', 'photo_library', 'play_arrow', 'present_to_all', 'restaurant', 'schedule', 'search', 'send', 'star', 'tune', 'upload',
  'videocam', 'videocam_off', 'warning',
];
