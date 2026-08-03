import { useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../api";
import {
  DndContext,
  DragOverlay,
  closestCorners,
  PointerSensor,
  useSensor,
  useSensors,
  type DragStartEvent,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  verticalListSortingStrategy,
  useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Users, GripVertical } from "lucide-react";
import toast from "react-hot-toast";

const STAGES = [
  { id: "todo", label: "To Do", color: "bg-gray-100 border-gray-300" },
  { id: "follow_up_1", label: "Follow Up 1", color: "bg-blue-50 border-blue-300" },
  { id: "follow_up_2", label: "Follow Up 2", color: "bg-amber-50 border-amber-300" },
  { id: "follow_up_3", label: "Follow Up 3", color: "bg-orange-50 border-orange-300" },
  { id: "closed", label: "Closed", color: "bg-green-50 border-green-300" },
];

function KanbanCard({ contact, onGenerate }: { contact: any; onGenerate: (id: number) => void }) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: String(contact.id), data: { contact } });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="rounded-lg border border-gray-200 bg-white p-3 shadow-sm hover:shadow-md transition-shadow"
    >
      <div className="flex items-start justify-between">
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-gray-900 truncate">{contact.name}</p>
          {contact.company && (
            <p className="text-xs text-gray-500 truncate">{contact.company}</p>
          )}
          {contact.email && (
            <p className="text-xs text-gray-400 truncate">{contact.email}</p>
          )}
        </div>
        <div
          {...attributes}
          {...listeners}
          className="cursor-grab rounded p-1 text-gray-400 hover:bg-gray-100 active:cursor-grabbing"
        >
          <GripVertical className="h-4 w-4" />
        </div>
      </div>
      {!contact.email && (
        <button
          onClick={() => onGenerate(contact.id)}
          className="mt-2 w-full rounded border border-dashed border-gray-300 px-2 py-1 text-xs text-gray-500 hover:border-brand-400 hover:text-brand-600"
        >
          + Generate Pitch
        </button>
      )}
    </div>
  );
}

function KanbanColumn({
  stage,
  contacts,
  onGenerate,
}: {
  stage: (typeof STAGES)[0];
  contacts: any[];
  onGenerate: (id: number) => void;
}) {
  const items = contacts.map((c) => String(c.id));

  return (
    <div className={`flex min-w-[280px] flex-col rounded-xl border-2 ${stage.color} p-3`}>
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-gray-700">{stage.label}</h3>
        <span className="flex h-6 w-6 items-center justify-center rounded-full bg-gray-200 text-xs font-medium text-gray-600">
          {contacts.length}
        </span>
      </div>
      <SortableContext items={items} strategy={verticalListSortingStrategy}>
        <div className="flex flex-1 flex-col gap-2 min-h-[100px]">
          {contacts.map((contact) => (
            <KanbanCard
              key={contact.id}
              contact={contact}
              onGenerate={onGenerate}
            />
          ))}
        </div>
      </SortableContext>
    </div>
  );
}

export default function KanbanPage() {
  const [searchParams] = useSearchParams();
  const queryClient = useQueryClient();
  const [activeId, setActiveId] = useState<string | null>(null);
  const campaignId = Number(searchParams.get("campaign")) || 1;

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 8 },
    })
  );

  const { data: kanbanData, isLoading } = useQuery({
    queryKey: ["kanban", campaignId],
    queryFn: () => api.getKanban(campaignId),
  });

  const { data: campaigns } = useQuery({
    queryKey: ["campaigns"],
    queryFn: api.getCampaigns,
  });

  const moveMutation = useMutation({
    mutationFn: ({ contactId, stage }: { contactId: number; stage: string }) =>
      api.moveKanban(contactId, stage),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["kanban", campaignId] });
    },
  });

  const generateMutation = useMutation({
    mutationFn: (contactId: number) => api.generatePitch(contactId, "email"),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["kanban", campaignId] });
      toast.success("Pitch generated!");
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const handleDragStart = (event: DragStartEvent) => {
    setActiveId(String(event.active.id));
  };

  const handleDragEnd = (event: DragEndEvent) => {
    setActiveId(null);
    const { active, over } = event;
    if (!over) return;

    const activeData = active.data.current as { contact: any } | undefined;
    if (!activeData) return;

    // Determine target stage from the drop target
    let targetStage = "";

    // Check if dropped on another card
    const overData = over.data.current as { contact: any } | undefined;
    if (overData) {
      // Find which column this card belongs to
      for (const stage of STAGES) {
        const stageContacts = kanbanData?.[stage.id] || [];
        if (stageContacts.find((c: any) => String(c.id) === String(over.id))) {
          targetStage = stage.id;
          break;
        }
      }
    }

    // Check if dropped directly on a column (using stage ID)
    if (!targetStage) {
      for (const stage of STAGES) {
        if (stage.id === String(over.id)) {
          targetStage = stage.id;
          break;
        }
      }
    }

    if (targetStage && targetStage !== activeData.contact.kanbanStage) {
      moveMutation.mutate({
        contactId: activeData.contact.id,
        stage: targetStage,
      });
    }
  };

  // Find the active contact for the overlay
  const allContacts = STAGES.flatMap(
    (s) => kanbanData?.[s.id] || []
  );
  const activeContact = allContacts.find(
    (c) => String(c.id) === activeId
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Kanban Board</h1>
          <p className="mt-1 text-gray-500">Drag contacts between stages</p>
        </div>
        <select
          className="select w-64"
          value={campaignId}
          onChange={(e) => {
            window.location.href = `/kanban?campaign=${e.target.value}`;
          }}
        >
          {(campaigns || []).map((c: any) => (
            <option key={c.id} value={c.id}>
              {c.name} ({c.contactCount} contacts)
            </option>
          ))}
        </select>
      </div>

      {/* Kanban Board */}
      {isLoading ? (
        <div className="flex h-64 items-center justify-center">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-brand-600 border-t-transparent" />
        </div>
      ) : (
        <DndContext
          sensors={sensors}
          collisionDetection={closestCorners}
          onDragStart={handleDragStart}
          onDragEnd={handleDragEnd}
        >
          <div className="flex gap-4 overflow-x-auto pb-4">
            {STAGES.map((stage) => (
              <KanbanColumn
                key={stage.id}
                stage={stage}
                contacts={kanbanData?.[stage.id] || []}
                onGenerate={(id) => generateMutation.mutate(id)}
              />
            ))}
          </div>
          <DragOverlay>
            {activeContact ? (
              <div className="rounded-lg border-2 border-brand-400 bg-white p-3 shadow-lg opacity-90">
                <p className="text-sm font-medium text-gray-900">
                  {activeContact.name}
                </p>
                {activeContact.company && (
                  <p className="text-xs text-gray-500">{activeContact.company}</p>
                )}
              </div>
            ) : null}
          </DragOverlay>
        </DndContext>
      )}
    </div>
  );
}
