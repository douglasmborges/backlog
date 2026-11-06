import '@servicenow/sdk/global'
import { Table, StringColumn, IntegerColumn, Acl } from '@servicenow/sdk/core'

// Leaderboard for the Backlog game. One row per finished run.
export const x_2302769_backlog_score = Table({
    name: 'x_2302769_backlog_score',
    label: 'Backlog Score',
    display: 'player_name',
    accessibleFrom: 'public',
    allowWebServiceAccess: true,
    schema: {
        player_name: StringColumn({ label: 'Player', maxLength: 40, mandatory: true }),
        time_ms: IntegerColumn({ label: 'Time (ms)', mandatory: true }),
        deaths: IntegerColumn({ label: 'Deaths' }),
    },
})

// Any signed-in user can read the ranking and add their own run.
Acl({
    $id: Now.ID['backlog_score_read'],
    type: 'record',
    table: 'x_2302769_backlog_score',
    operation: 'read',
    roles: ['snc_internal'],
})

Acl({
    $id: Now.ID['backlog_score_create'],
    type: 'record',
    table: 'x_2302769_backlog_score',
    operation: 'create',
    roles: ['snc_internal'],
})
