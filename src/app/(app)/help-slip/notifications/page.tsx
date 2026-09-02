import { NotificationCentre } from "@/components/help-slip/notification-centre";

/**
 * The notification centre.
 *
 * No Suspense boundary: this screen holds no filter state in the URL and never
 * reads `useSearchParams`, so there is nothing for Next to suspend on. Its own
 * loading state lives inside `<ListState>`, where it is the shape of the list
 * rather than a page-sized skeleton.
 */
export default function HelpSlipNotificationsPage() {
  return <NotificationCentre />;
}
