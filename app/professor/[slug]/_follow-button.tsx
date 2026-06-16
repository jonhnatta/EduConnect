"use client"

import { useState, useTransition } from "react"
import { Button } from "@/components/ui/button"
import { UserPlus, UserCheck, Loader2, Users } from "lucide-react"
import { toggleFollow } from "@/app/actions/follows"

interface Props {
  teacherId: string
  initialFollowing: boolean
  initialCount: number
}

function formatCount(n: number) {
  if (n >= 1000) return `${(n / 1000).toFixed(n >= 10000 ? 0 : 1)}k`
  return String(n)
}

export function FollowButton({ teacherId, initialFollowing, initialCount }: Props) {
  const [following, setFollowing] = useState(initialFollowing)
  const [count, setCount] = useState(initialCount)
  const [isPending, startTransition] = useTransition()

  function handleClick() {
    // Optimistic update
    const nextFollowing = !following
    setFollowing(nextFollowing)
    setCount((c) => (nextFollowing ? c + 1 : Math.max(c - 1, 0)))

    startTransition(async () => {
      const result = await toggleFollow(teacherId)
      if (result.ok) {
        setFollowing(result.following)
        setCount(result.followersCount)
      } else {
        // Reverte em caso de erro
        setFollowing(following)
        setCount(count)
      }
    })
  }

  return (
    <div className="flex items-center gap-3">
      <div className="text-center">
        <div className="font-display font-bold text-xl text-gray-900">
          {formatCount(count)}
        </div>
        <div className="text-xs text-gray-500 flex items-center gap-1 justify-center mt-0.5">
          <Users className="h-3 w-3" /> Seguidores
        </div>
      </div>

      <Button
        onClick={handleClick}
        disabled={isPending}
        className={`px-6 gap-2 ${
          following
            ? "bg-gray-100 text-gray-800 hover:bg-red-50 hover:text-red-600 border border-gray-200"
            : "bg-[#1D4ED8] text-white hover:bg-[#1E3A8A]"
        }`}
      >
        {isPending ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : following ? (
          <UserCheck className="h-4 w-4" />
        ) : (
          <UserPlus className="h-4 w-4" />
        )}
        {following ? "Seguindo" : "Seguir"}
      </Button>
    </div>
  )
}
