-- SQL scripts for initialization goes here...

CREATE DATABASE [MyLA.Gov];
GO; 

USE [MyLA.Gov];
GO;

CREATE TABLE [dbo].[SessionCache] (
    [Id]                         NVARCHAR (449)     COLLATE SQL_Latin1_General_CP1_CS_AS NOT NULL,
    [Value]                      VARBINARY (MAX)    NOT NULL,
    [ExpiresAtTime]              DATETIMEOFFSET (7) NOT NULL,
    [SlidingExpirationInSeconds] BIGINT             NULL,
    [AbsoluteExpiration]         DATETIMEOFFSET (7) NULL
);
GO;

CREATE NONCLUSTERED INDEX [Index_ExpiresAtTime]
    ON [dbo].[SessionCache]([ExpiresAtTime] ASC);