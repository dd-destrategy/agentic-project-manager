'use client';

import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import type { MeetingType, MeetingMetadata } from '@/types';
import { meetingTypeLabels } from '@/types';

interface MeetingModeProps {
  onSubmit: (metadata: MeetingMetadata, transcript: string) => void;
  isLoading?: boolean;
}

export function MeetingMode({ onSubmit, isLoading }: MeetingModeProps) {
  const [meetingType, setMeetingType] = useState<MeetingType>('standup');
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]!);
  const [attendees, setAttendees] = useState('');
  const [transcript, setTranscript] = useState('');

  const attendeeList = attendees
    .split(',')
    .map((a) => a.trim())
    .filter(Boolean);

  const handleSubmit = () => {
    const metadata: MeetingMetadata = {
      meetingType,
      date,
      attendees: attendeeList,
    };
    onSubmit(metadata, transcript);
  };

  return (
    <Card variant="glass">
      <CardHeader>
        <CardTitle>Meeting Notes Ingestion</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="meetingType">Meeting Type</Label>
            <select
              id="meetingType"
              value={meetingType}
              onChange={(e) => setMeetingType(e.target.value as MeetingType)}
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              {Object.entries(meetingTypeLabels).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="meetingDate">Date</Label>
            <Input
              id="meetingDate"
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
            />
          </div>
        </div>
        <div className="space-y-2">
          <Label htmlFor="attendees">Attendees (comma-separated)</Label>
          <Input
            id="attendees"
            value={attendees}
            onChange={(e) => setAttendees(e.target.value)}
            placeholder="Alice, Bob, Carol"
          />
          {attendeeList.length > 0 && (
            <div className="flex flex-wrap gap-1 pt-1">
              {attendeeList.map((name, i) => (
                <Badge key={i} variant="secondary" className="text-xs">
                  {name}
                </Badge>
              ))}
            </div>
          )}
        </div>
        <div className="space-y-2">
          <Label htmlFor="transcript">Meeting Notes / Transcript</Label>
          <textarea
            id="transcript"
            className="flex min-h-[200px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            value={transcript}
            onChange={(e) => setTranscript(e.target.value)}
            placeholder="Paste meeting notes or transcript here..."
          />
        </div>
        <Button
          onClick={handleSubmit}
          disabled={!transcript.trim() || isLoading}
        >
          {isLoading ? 'Processing...' : 'Extract Items from Meeting'}
        </Button>
      </CardContent>
    </Card>
  );
}
