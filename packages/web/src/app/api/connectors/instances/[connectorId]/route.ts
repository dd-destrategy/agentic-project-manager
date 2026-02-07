/**
 * API Route: /api/connectors/instances/[connectorId]
 *
 * PATCH  — Update an instance (toggle enabled, update health, etc.)
 * DELETE — Disconnect (remove) an instance
 */

import { NextRequest, NextResponse } from 'next/server';

import { getInstanceStore } from '../route';

// ---------------------------------------------------------------------------
// PATCH /api/connectors/instances/[connectorId]
// ---------------------------------------------------------------------------

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ connectorId: string }> }
) {
  try {
    const { connectorId } = await params;
    const store = getInstanceStore();
    const instance = store.get(connectorId);

    if (!instance) {
      return NextResponse.json(
        { error: `Instance '${connectorId}' not found` },
        { status: 404 }
      );
    }

    const body = await request.json();
    const updated = {
      ...instance,
      ...body,
      updatedAt: new Date().toISOString(),
    };
    store.set(connectorId, updated);

    return NextResponse.json({ instance: updated });
  } catch (error) {
    console.error('Error updating instance:', error);
    return NextResponse.json(
      { error: 'Failed to update instance' },
      { status: 500 }
    );
  }
}

// ---------------------------------------------------------------------------
// DELETE /api/connectors/instances/[connectorId]
// ---------------------------------------------------------------------------

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ connectorId: string }> }
) {
  try {
    const { connectorId } = await params;
    const store = getInstanceStore();

    if (!store.has(connectorId)) {
      return NextResponse.json(
        { error: `Instance '${connectorId}' not found` },
        { status: 404 }
      );
    }

    store.delete(connectorId);

    return NextResponse.json({ deleted: true });
  } catch (error) {
    console.error('Error deleting instance:', error);
    return NextResponse.json(
      { error: 'Failed to delete instance' },
      { status: 500 }
    );
  }
}
