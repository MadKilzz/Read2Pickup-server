const errors: { [k: string]: ErrorItem } = {
    INCORRECT_BODY: {
        status: 400,
        message: 'Your body is missing some parts, or it is not given correctly.'
    },
    USER_NOT_FOUND: {
        status: 404,
        message: "User with this phone number/email was not found."
    },
    INVALID_OR_EXPIRED_OTP: {
        status: 400,
        message: "The OTP you entered is invalid or has expired."
    },
    PHONE_NOT_VERIFIED: {
        status: 403,
        message: "Phone verification required. OTP sent."
    },
    ACCOUNT_ALREADY_EXISTS: {
        status: 400,
        message: 'This email or phone number is already registered with us.'
    },
    UNKNOWN_ERROR: {
        status: 500,
        message: 'An unknown error has been occurred.'
    },

    MISSING_DRAFT_ID: {
        status: 400,
        message: "Missing 'id' parameter in the URL or request body."
    },
    DRAFT_PAYMENT_IN_PROGRESS: {
        status: 409,
        message: 'This draft cannot be modified while payment is in progress.'
    },
    DRAFT_NOT_FOUND: {
        status: 404,
        message: "The requested booking draft could not be found."
    },
    COMPANY_PROFILE_NOT_FOUND: {
        status: 404,
        message: "The requested company profile could not be found."
    },
    BOOKING_NOT_FOUND: {
        status: 404,
        message: "The requested booking could not be found."
    },
    MISSING_BOOKING_ID: {
        status: 400,
        message: "Missing booking ID."
    },
    BOOKING_ALREADY_CANCELED: {
        status: 409,
        message: "This booking has already been canceled."
    },
    BOOKING_ALREADY_ASSIGNED: {
        status: 409,
        message: "This booking could not be canceled because it was just assigned to a driver."
    },
    BOOKING_NOT_COMPLETED: {
        status: 400,
        message: "Only completed rides can be rebooked."
    },
    METHOD_NOT_ALLOWED: {
        status: 405,
        message: 'Method is now allowed on this server!'
    },
    REQUEST_NOT_ALLOWED: {
        status: 403,
        message: "You are not allowed to perform this request."
    },
    AUTH_FAILED: {
        status: 403,
        message: 'Incorrect credentials where given for this user.'
    },
    NO_AUTHENTICATION: {
        status: 401,
        message: 'Where is your authentication-header?'
    },
    NOT_AUTHENTICATED: {
        status: 401,
        message: 'I\'m sorry. But you are not authenticated for this resource...'
    },
    NO_REFRESH: {
        status: 400,
        message: 'You want to refresh a token without a refresh-token?'
    },
    INVALID_REFRESH: {
        status: 400,
        message: 'You have sent an incorrect or corrupted refresh-token, which the server can not accept.'
    },
    INVALID_TOKEN: {
        status: 401,
        message: 'For an authenticated request, you must specify a valid authentication token!'
    },
    RATE_LIMIT: {
        status: 429,
        message: "Too many requests. Please try again later."
    },
    INVALID_LOCATION: {
        status: 400,
        message: "The specified location is invalid."
    },
    OUT_OF_SERVICE_AREA: {
        status: 400,
        message: "The pickup location is outside our service area."
    },
    INVALID_PASSWORD: {
        status: 403,
        message: "The current password you entered is incorrect."
    },
    PASSWORD_MISMATCH: {
        status: 400,
        message: "New passwords do not match."
    },
    BILLING_ADDRESS_NOT_FOUND: {
        status: 404,
        message: "Billing address not found."
    },
    CANNOT_DELETE_DEFAULT_PAYMENT_METHOD: {
        status: 400,
        message: "Cannot delete the default payment method. Please set another payment method as default first."
    },
    LOCATION_TOO_OLD: {
        status: 400,
        message: "Location timestamp is too old. Please send a fresh location."
    },
    LOCATION_JUMP_INVALID: {
        status: 400,
        message: "Location change is too large for the time elapsed. Please send a valid location."
    },
    OFFER_NOT_FOUND_OR_ALREADY_RESPONDED: {
        status: 404,
        message: "Offer not found or already accepted/declined."
    },
    BOOKING_NOT_FOUND_OR_NOT_ASSIGNED: {
        status: 404,
        message: "Booking not found or not assigned to you."
    },
    INVALID_DISPATCH_STATUS_TRANSITION: {
        status: 400,
        message: "This status transition is not allowed."
    },
    REASSIGN_NOT_ALLOWED: {
        status: 400,
        message: "Reassign is not allowed for this booking status."
    },
    DRIVER_NOT_FOUND: {
        status: 404,
        message: "Driver not found."
    },
    OFFER_NOT_ALLOWED_FOR_STATUS: {
        status: 400,
        message: "This booking cannot receive new offers in its current status."
    },
    DRIVER_CAR_TYPE_MISMATCH: {
        status: 400,
        message: "Driver's car type does not match the booking."
    },
    ALREADY_OFFERED_OR_ACCEPTED: {
        status: 400,
        message: "This driver has already been offered this ride or has accepted it."
    },
    DRIVER_REQUEST_ALREADY_SUBMITTED: {
        status: 409,
        message: "You have already submitted a driver application."
    },
    DRIVER_REQUEST_NOT_FOUND: {
        status: 404,
        message: "Driver request not found."
    },
    DRIVER_REQUEST_NOT_PENDING: {
        status: 400,
        message: "This request is already approved or rejected."
    },
    DRIVER_REQUEST_NOT_REJECTED: {
        status: 400,
        message: "Only rejected applications can be removed."
    },
    USER_ALREADY_DRIVER: {
        status: 400,
        message: "This user is already a driver."
    },
    CAR_TYPE_NOT_FOUND_OR_INACTIVE: {
        status: 400,
        message: "The selected car type was not found or is not available for drivers."
    },
    LOGOUT_NOT_ALLOWED_ON_BOOKING: {
        status: 409,
        message: "You cannot log out while you are on a trip."
    },
}

export interface ErrorItem {
    status: number;
    message: string;
}

export default errors;