const { User, Load, Op, Sequelize, sequelize } = require('../db/models');

async function removeArchivedLoadsFromUsers() {
  try {
    // Step 1: Find all users with marked_expired_loads length > 0
    const usersWithExpiredLoads = await sequelize.query(
      `
      SELECT id, marked_expired_loads
      FROM users
      WHERE array_length(marked_expired_loads, 1) > 0;
    `,
      {
        type: Sequelize.QueryTypes.SELECT,
      }
    );

    // Step 2: Iterate through the users
    for (const user of usersWithExpiredLoads) {
      const { id, marked_expired_loads } = user;

      if (marked_expired_loads.length === 0) continue;

      // Step 3: Find which of the user's marked_expired_loads are archived
      const archivedLoads = await sequelize.query(
        `
        SELECT id
        FROM loads
        WHERE id = ANY(ARRAY[:marked_expired_loads]::varchar[]) AND is_archived = true;
      `,
        {
          type: Sequelize.QueryTypes.SELECT,
          replacements: { marked_expired_loads }, // Automatically passes the array in the correct format
        }
      );

      const archivedLoadIds = archivedLoads.map(load => load.id);

      if (archivedLoadIds.length > 0) {
        // Step 4: Remove the archived loads from the user's marked_expired_loads array
        const updatedMarkedExpiredLoads = marked_expired_loads.filter(
          loadId => !archivedLoadIds.includes(loadId)
        );

        // Step 5: Update the user in the database with the new marked_expired_loads array
        await sequelize.query(
          `
          UPDATE users
          SET marked_expired_loads = ARRAY[:updatedMarkedExpiredLoads]::varchar[]
          WHERE id = :userId;
        `,
          {
            replacements: {
              updatedMarkedExpiredLoads,
              userId: id,
            },
          }
        );

        console.log(`Updated user ${id}, removed archived loads: ${archivedLoadIds}`);
      }
    }

    console.log('Archived loads removed successfully from all relevant users.');
  } catch (error) {
    console.error('Error removing archived loads:', error);
  } finally {
    // Close the database connection
    await sequelize.close();
  }
}

async function removeArchivedVehiclesFromUsers() {
  try {
    // Step 1: Find all users with marked_invalid_vehicles length > 0
    const usersWithInvalidVehicles = await sequelize.query(
      `
      SELECT id, marked_invalid_vehicles
      FROM users
      WHERE array_length(marked_invalid_vehicles, 1) > 0;
    `,
      {
        type: Sequelize.QueryTypes.SELECT,
      }
    );

    // Step 2: Iterate through the users
    for (const user of usersWithInvalidVehicles) {
      const { id, marked_invalid_vehicles } = user;

      if (marked_invalid_vehicles.length === 0) continue;

      // Step 3: Find which of the user's marked_invalid_vehicles are archived
      const archivedVehicles = await sequelize.query(
        `
        SELECT id
        FROM vehicles
        WHERE id = ANY(ARRAY[:marked_invalid_vehicles]::integer[]) AND is_archived = true;
      `,
        {
          type: Sequelize.QueryTypes.SELECT,
          replacements: { marked_invalid_vehicles },
        }
      );

      // Convert IDs to strings to match the data type in marked_invalid_vehicles
      const archivedVehicleIds = archivedVehicles.map(vehicle => vehicle.id.toString());

      if (archivedVehicleIds.length > 0) {
        // Step 4: Remove the archived vehicles from the user's marked_invalid_vehicles array
        const updatedMarkedInvalidVehicles = marked_invalid_vehicles.filter(
          vehicleId => !archivedVehicleIds.includes(vehicleId)
        );

        // Step 5: Update the user in the database with the new marked_invalid_vehicles array
        await sequelize.query(
          `
          UPDATE users
          SET marked_invalid_vehicles = ARRAY[:updatedMarkedInvalidVehicles]::varchar[]
          WHERE id = :userId;
        `,
          {
            replacements: {
              updatedMarkedInvalidVehicles,
              userId: id,
            },
          }
        );

        console.log(`Updated user ${id}, removed archived vehicles: ${archivedVehicleIds}`);
      }
    }

    console.log('Archived vehicles removed successfully from all relevant users.');
  } catch (error) {
    console.error('Error removing archived vehicles:', error);
  } finally {
    // Close the database connection
    await sequelize.close();
  }
}

removeArchivedVehiclesFromUsers();
// removeArchivedLoadsFromUsers();
