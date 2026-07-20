// A reusable person row: avatar + identity (linking to /u/:handle) + the RelationshipButton.
// Shared by search results, co-member suggestions, and the follow-back list (U4).

import { Link } from '@tanstack/react-router'
import { Avatar, AvatarFallback, AvatarImage } from '../components/ui/avatar'
import { memberInitials } from '../sessions/sessionsTypes'
import { RelationshipButton } from './RelationshipButton'
import type { ProfileCard } from './socialTypes'

export function PersonRow({ card }: { card: ProfileCard }) {
  const initials = memberInitials({ displayName: card.displayName, handle: card.handle, userId: card.id })
  return (
    <div className="flex items-center gap-3 py-2">
      <Link
        to="/u/$handle"
        params={{ handle: card.handle }}
        className="flex min-w-0 flex-1 items-center gap-3 rounded-md outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <Avatar size="sm">
          {card.avatarUrl && <AvatarImage src={card.avatarUrl} alt="" />}
          <AvatarFallback className="bg-primary/15 font-semibold text-foreground">
            {initials}
          </AvatarFallback>
        </Avatar>
        <div className="min-w-0">
          {card.displayName.trim() && (
            <p className="truncate font-medium text-foreground">{card.displayName}</p>
          )}
          <p className="truncate text-sm text-muted-foreground">@{card.handle}</p>
        </div>
      </Link>
      <RelationshipButton target={card} />
    </div>
  )
}
