import {
    IHttp,
    IModify,
    IPersistence,
    IRead,
} from "@rocket.chat/apps-engine/definition/accessors";
import { WhiteboardApp } from "../WhiteboardApp";
import {
    IUIKitResponse,
    UIKitViewSubmitInteractionContext,
} from "@rocket.chat/apps-engine/definition/uikit";
import { UtilityEnum } from "../enum/uitlityEnum";
import { IUser } from "@rocket.chat/apps-engine/definition/users/IUser";
import { buildHeaderBlock } from "../blocks/UtilityBlock";
import {
    getBoardRecordByMessageId,
    updateBoardnameByMessageId,
} from "../persistence/boardInteraction";
import { getDirect, sendMessage, sendNotification } from "../lib/messages";

//This class will handle all the view submit interactions
export class ExecuteViewSubmitHandler {
    constructor(
        private readonly app: WhiteboardApp,
        private readonly read: IRead,
        private readonly http: IHttp,
        private readonly persistence: IPersistence,
        private readonly modify: IModify,
        private readonly context: UIKitViewSubmitInteractionContext
    ) {}

    public async run(): Promise<IUIKitResponse> {
        const { user, view } = this.context.getInteractionData();
        const AppSender: IUser = (await this.read
            .getUserReader()
            .getAppUser()) as IUser;
        const appId = AppSender.appId;
        try {
            switch (view.id) {
                case UtilityEnum.SETTINGS_MODAL_ID:
                    if (view.state && appId) {
                        const boardname =
                            view.state?.[UtilityEnum.BOARD_INPUT_BLOCK_ID]?.[
                                UtilityEnum.BOARD_INPUT_ACTION_ID
                            ];
                        const messageId =
                            this.context.getInteractionData().view.submit
                                ?.value;

                        if (messageId) {
                            await updateBoardnameByMessageId(
                                this.persistence,
                                messageId,
                                boardname
                            );
                            const room = await this.read
                                .getMessageReader()
                                .getRoom(messageId);

                            if (room) {
                                const message = await this.modify
                                    .getUpdater()
                                    .message(messageId, AppSender);

                                const url =
                                    message.getBlocks()[1]["elements"][1][
                                        "url"
                                    ];
                                const updateHeaderBlock =
                                    await buildHeaderBlock(
                                        user.username,
                                        url,
                                        appId,
                                        boardname
                                    );

                                message.setEditor(user).setRoom(room);
                                message.setBlocks(updateHeaderBlock);

                                if (
                                    view.state[
                                        UtilityEnum.BOARD_SELECT_BLOCK_ID
                                    ] != undefined &&
                                    view.state[
                                        UtilityEnum.BOARD_SELECT_BLOCK_ID
                                    ][UtilityEnum.BOARD_SELECT_ACTION_ID] !=
                                        undefined
                                ) {
                                    const boardStatus =
                                        view.state[
                                            UtilityEnum.BOARD_SELECT_BLOCK_ID
                                        ][UtilityEnum.BOARD_SELECT_ACTION_ID];

                                    if (
                                        boardStatus != undefined &&
                                        boardStatus == UtilityEnum.PRIVATE
                                    ) {
                                        const directRoom = await getDirect(
                                            this.read,
                                            this.modify,
                                            AppSender,
                                            user.username
                                        );

                                        if (directRoom) {
                                            await sendNotification(
                                                this.read,
                                                this.modify,
                                                user,
                                                room,
                                                `This Board has been made private by \`@${user.username}\``
                                            );
                                            await sendNotification(
                                                this.read,
                                                this.modify,
                                                user,
                                                directRoom,
                                                `This Board has been made private by you`
                                            );
                                            message.setRoom(directRoom);
                                            await this.modify
                                                .getUpdater()
                                                .finish(message);
                                        }
                                    }
                                    if (
                                        boardStatus != undefined &&
                                        boardStatus == UtilityEnum.PUBLIC
                                    ) {
                                        const originalRoom = (
                                            await getBoardRecordByMessageId(
                                                this.read.getPersistenceReader(),
                                                messageId
                                            )
                                        ).room;
                                        if (originalRoom) {
                                            await sendNotification(
                                                this.read,
                                                this.modify,
                                                user,
                                                room,
                                                `This Board has been made public by you`
                                            );
                                            message.setRoom(originalRoom);
                                            await this.modify
                                                .getUpdater()
                                                .finish(message);
                                        }
                                    }
                                } else {
                                    await this.modify
                                        .getUpdater()
                                        .finish(message);
                                }
                            } else {
                                console.log("Room not found");
                            }
                        } else {
                            console.log("MessageId not found");
                        }
                    } else {
                        console.log("Submit Failed");
                    }

                    return this.context
                        .getInteractionResponder()
                        .successResponse();

                default:
                    console.log("View Id not found");
                    return this.context
                        .getInteractionResponder()
                        .successResponse();
            }
        } catch (err) {
            console.log(err);
            return this.context.getInteractionResponder().errorResponse();
        }
    }
}
